(ns lg-open-isic.graphs.classify-entity
  "open-isic `classify_entity` graph — direct ISIC Rev.4 4-digit classification.

  NSID: com.etzhayyim.apps.openIsic.classifyEntity
  clj port (ADR-2606280030) of the Python `graphs/classify_entity.py`, which is a
  thin re-export of `kotodama.langgraph_graphs.open_isic_classify_entity`.

  PORT NOTE (deviation): the kotodama `build_graph()` lives in an external crate
  (`40-engine/kotoba/crates/kotoba-kotodama/py`) NOT present in this app tree, so
  this twin reconstructs the DOCUMENTED behaviour from the app CLAUDE.md rather
  than transliterating opaque bytecode:
    - 'Direct routing to explicit 4-digit class tools' → a single injectable
      classifier seam (`*classify*`) defaulting to the Murakumo loopback LLM
      gateway (LiteLLM 127.0.0.1:4000, ADR-2605215000), fleet-guarded.
    - Verification decision rule (CLAUDE.md): confidence ≥0.9 → authoritative,
      ≥0.5 → community, <0.5 → candidate. Implemented as the pure
      `verification-for-confidence` (UDF `openIsic.verificationForConfidence`).
    - Persistence → the injectable kotoba Datom-log store seam (lg-open-isic.store),
      NOT RisingWave (substrate boundary, MIGRATION-TODO).

  Topology: START → validate → classify → verify → write_record → END.

  langgraph-clj has no per-node RetryPolicy; the classifier seam is best-effort
  and fail-soft instead (mirrors the python graph having no retry on the tool)."
  (:require #?(:clj [cheshire.core :as json])
            [clojure.string :as str]
            [langgraph.graph :as g]
            [lg-open-isic.store :as store]))

;; ── verification decision rule (UDF openIsic.verificationForConfidence) ─────

(defn verification-for-confidence
  "Pure: map a confidence ∈ [0,1] to a verification tier (CLAUDE.md table)."
  [confidence]
  (let [c (double (or confidence 0.0))]
    (cond
      (>= c 0.9) "authoritative"
      (>= c 0.5) "community"
      :else      "candidate")))

;; ── Murakumo fleet guard (ADR-2605215000) ───────────────────────────────────

(def murakumo-allowed-hosts
  #{"127.0.0.1:4000" "localhost:4000"
    "192.168.1.70:8077" "192.168.1.70:11434"
    "127.0.0.1:11434" "localhost:11434"})

(def default-config {:url "http://127.0.0.1:4000/v1"
                     :model "gemma3:4b"})

(defn assert-murakumo
  "Refuse any inference endpoint outside the Murakumo fleet (http only)."
  [endpoint]
  (let [[_ scheme host] (or (re-find #"^([A-Za-z][A-Za-z0-9+.\-]*)://([^/?#]*)" (str endpoint))
                            [nil nil nil])]
    (when-not (and (= "http" (some-> scheme str/lower-case))
                   (contains? murakumo-allowed-hosts (some-> host str/lower-case)))
      (throw (ex-info (str "inference endpoint " (pr-str endpoint)
                           " is outside the Murakumo fleet (ADR-2605215000)")
                      {:murakumo-only-violation true :endpoint endpoint})))))

(defn- clip [s n] (let [s (str s)] (subs s 0 (min n (count s)))))

;; ── injectable classifier seam (Murakumo loopback default) ──────────────────

(defn classify-with
  "Default `*classify*`: ask the Murakumo loopback LLM to route a subject to a
  4-digit ISIC class. Returns {:code <str> :nameEn <str> :confidence <num>} or
  {:error <str>}. Tests rebind this to a deterministic stub."
  [http-post {:keys [url model] :or {url (:url default-config)
                                     model (:model default-config)}} subject _hint]
  (when-not (fn? http-post)
    (throw (ex-info "Open ISIC classification requires an explicit HTTP POST capability"
                    {:capability :open-isic/murakumo-http-post})))
  #?(:clj
     (try
       (let [url      (str/replace (str url) #"/+$" "")
             _        (assert-murakumo url)
             system   (str "You are an ISIC Rev.4 industrial classifier. Given a subject, "
                           "return STRICT JSON {\"code\":\"<4-digit>\",\"nameEn\":\"<class name>\","
                           "\"confidence\":<0..1>}. No prose.")
             resp     (http-post (str url "/chat/completions")
                            {:headers {"Content-Type" "application/json"}
                             :timeout 60000
                             :body (json/generate-string {:model model
                                              :messages [{:role "system" :content system}
                                                         {:role "user" :content (str "Subject: " subject)}]
                                              :temperature 0.0})})]
         (if (>= (:status resp) 400)
           {:error (str "llm " (:status resp) ": " (clip (:body resp) 200))}
           (let [body (json/parse-string (:body resp) true)
                 txt  (some-> (get-in body [:choices 0 :message :content]) str str/trim)
                 j    (try (json/parse-string txt true) (catch Exception _ nil))]
             (if (and j (:code j))
               {:code (str (:code j)) :nameEn (:nameEn j)
                :confidence (double (or (:confidence j) 0.0))}
               {:error (str "classifier returned non-JSON: " (clip txt 120))}))))
       (catch Exception e {:error (clip (.getMessage e) 200)}))
     :default {:error "classifier not available on this host"}))

(def ^:dynamic *classify* nil)

(defn classify [subject hint]
  (when-not (fn? *classify*)
    (throw (ex-info "Open ISIC classification requires an explicit classifier capability"
                    {:capability :open-isic/classify})))
  (*classify* subject hint))

;; ── nodes ────────────────────────────────────────────────────────────────────

(defn node-validate
  "Guard: a non-blank subject/entity string is required."
  [state]
  (let [subject (str/trim (or (:subject state) (:entity state) (:text state) ""))]
    (if (str/blank? subject)
      {:error "subject is required"}
      {:subject subject})))

(defn node-classify
  "Route the subject to a 4-digit class via the injectable classifier seam."
  [state]
  (if (:error state)
    {}
    (let [res (classify (:subject state) (:hint state))]
      (if (:error res)
        {:error (:error res)}
        {:code (:code res) :nameEn (:nameEn res)
         :confidence (double (or (:confidence res) 0.0))}))))

(defn node-verify
  "Attach the verification tier derived from confidence (pure rule)."
  [state]
  (if (or (:error state) (nil? (:code state)))
    {}
    {:verification (verification-for-confidence (:confidence state))}))

(defn node-write-record
  "Persist the classification through the injectable kotoba Datom-log seam."
  [state]
  (if (or (:error state) (nil? (:code state)))
    {}
    (let [res (store/write-record!
               {:subject (:subject state) :code (:code state)
                :nameEn (:nameEn state) :confidence (:confidence state)
                :verification (:verification state)
                :graph "classify_entity"})]
      (cond-> {}
        (:vertex_id res) (assoc :vertex_id (:vertex_id res))
        (:error res)     (assoc :error (:error res))))))

(defn build
  "Compile the classify_entity StateGraph
  (validate → classify → verify → write_record)."
  []
  (-> (g/state-graph)
      (g/add-node :validate node-validate)
      (g/add-node :classify node-classify)
      (g/add-node :verify node-verify)
      (g/add-node :write_record node-write-record)
      (g/add-edge :validate :classify)
      (g/add-edge :classify :verify)
      (g/add-edge :verify :write_record)
      (g/set-entry-point :validate)
      (g/set-finish-point :write_record)
      (g/compile-graph)))

(def GRAPH (build))
