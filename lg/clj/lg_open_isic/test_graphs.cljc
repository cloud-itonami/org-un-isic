(ns lg-open-isic.test-graphs
  "clojure.test for the lg-open-isic graph nodes + injectable seams. These cover
  behaviour the opaque Python re-exports could not exercise offline (the LLM /
  taxonomy / store edges are injectable here, so validation + the verification
  decision rule + the drill-down topology verify under bb with stubs)."
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.string :as str]
            [langgraph.graph :as g]
            [lg-open-isic.store :as store]
            [lg-open-isic.cron :as cron]
            [lg-open-isic.graphs.health :as health]
            [lg-open-isic.graphs.classify-entity :as ce]
            [lg-open-isic.graphs.hierarchical-classify :as hc]))

;; ── health graph end-to-end ─────────────────────────────────────────────────

(deftest health-graph-invokes
  (is (true? (:ok (g/invoke health/GRAPH {})))))

;; ── verification decision rule (UDF verificationForConfidence) ──────────────

(deftest verification-tiers
  (is (= "authoritative" (ce/verification-for-confidence 0.95)))
  (is (= "authoritative" (ce/verification-for-confidence 0.9)))
  (is (= "community"     (ce/verification-for-confidence 0.7)))
  (is (= "community"     (ce/verification-for-confidence 0.5)))
  (is (= "candidate"     (ce/verification-for-confidence 0.49)))
  (is (= "candidate"     (ce/verification-for-confidence 0.0)))
  (is (= "candidate"     (ce/verification-for-confidence nil))))

;; ── Murakumo fleet guard ─────────────────────────────────────────────────────

(deftest murakumo-guard
  (testing "off-fleet endpoint refused"
    (is (thrown? clojure.lang.ExceptionInfo (ce/assert-murakumo "https://api.openai.com/v1"))))
  (testing "malformed and lookalike endpoints refused"
    (is (thrown? clojure.lang.ExceptionInfo (ce/assert-murakumo "not-a-url")))
    (is (thrown? clojure.lang.ExceptionInfo
                 (ce/assert-murakumo "http://127.0.0.1.attacker.example:4000/v1"))))
  (testing "loopback gateway allowed"
    (is (nil? (ce/assert-murakumo "http://127.0.0.1:4000/v1")))))

(deftest live-authority-requires-explicit-capabilities
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"explicit classifier capability"
                        (ce/classify "farming" nil)))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"explicit HTTP POST capability"
                        (ce/classify-with nil ce/default-config "farming" nil))))

(deftest injected-classifier-wire-contract
  (let [seen (atom nil)
        result (ce/classify-with
                (fn [url opts]
                  (reset! seen [url opts])
                  {:status 200
                   :body "{\"choices\":[{\"message\":{\"content\":\"{\\\"code\\\":\\\"0111\\\",\\\"nameEn\\\":\\\"Growing cereals\\\",\\\"confidence\\\":0.95}\"}}]}"})
                ce/default-config "farming" nil)]
    (is (= "0111" (:code result)))
    (is (= 0.95 (:confidence result)))
    (is (= "http://127.0.0.1:4000/v1/chat/completions" (first @seen)))
    (is (re-find #"temperature.*0.0" (get-in @seen [1 :body])))))

;; ── classify_entity graph ────────────────────────────────────────────────────

(deftest classify-entity-validate-guard
  (is (= "subject is required" (:error (g/invoke ce/GRAPH {:subject "   "})))))

(deftest classify-entity-happy-path-stubbed
  (binding [ce/*classify* (fn [_subject _hint]
                            {:code "2520" :nameEn "Manufacture of weapons and ammunition"
                             :confidence 0.93})
            store/*write-record!* (fn [rec] {:vertex_id (str "at://x/" (:code rec))})]
    (let [out (g/invoke ce/GRAPH {:subject "small arms factory"})]
      (is (= "2520" (:code out)))
      (is (= "authoritative" (:verification out)))
      (is (= "at://x/2520" (:vertex_id out))))))

(deftest classify-entity-low-confidence-tier
  (binding [ce/*classify* (fn [_ _] {:code "0121" :nameEn "Growing of grapes" :confidence 0.4})
            store/*write-record!* (fn [_] {:vertex_id "at://x/0121"})]
    (let [out (g/invoke ce/GRAPH {:subject "vineyard"})]
      (is (= "candidate" (:verification out))))))

(deftest classify-entity-error-skips-write
  (binding [ce/*classify* (fn [_ _] {:error "classifier boom"})
            store/*write-record!* (fn [_] (throw (ex-info "should not write" {})))]
    (let [out (g/invoke ce/GRAPH {:subject "anything"})]
      (is (= "classifier boom" (:error out)))
      (is (nil? (:vertex_id out))))))

;; ── hierarchical_classify graph (drill-down loop) ────────────────────────────

(def fake-taxonomy
  {"section"  [{:code "C" :nameEn "Manufacturing"}]
   "division" [{:code "25" :nameEn "Manufacture of fabricated metal products"}]
   "group"    [{:code "252" :nameEn "Manufacture of weapons and ammunition"}]
   "class"    [{:code "2520" :nameEn "Manufacture of weapons and ammunition"}]})

(deftest hierarchical-validate-guard
  (is (= "subject is required" (:error (g/invoke hc/GRAPH {:subject ""})))))

(deftest hierarchical-drills-to-class
  (binding [hc/*fetch-taxonomy* (fn [level _path] (get fake-taxonomy level))
            hc/*pick* (fn [_subject _level candidates] (first candidates))
            store/*write-record!* (fn [rec] {:vertex_id (str "at://h/" (:code rec))})]
    (let [out (g/invoke hc/GRAPH {:subject "rifle plant"})]
      (is (= "2520" (:code out)))
      (is (true? (:done out)))
      (is (= 4 (count (:path out))) "walked section→division→group→class")
      (is (= ["section" "division" "group" "class"] (map :level (:path out))))
      (is (= "at://h/2520" (:vertex_id out))))))

(deftest hierarchical-no-candidates-errors
  (binding [hc/*fetch-taxonomy* (fn [_ _] [])]
    (let [out (g/invoke hc/GRAPH {:subject "rifle plant"})]
      (is (re-find #"no taxonomy candidates" (:error out)))
      (is (nil? (:code out))))))

(deftest next-level-walk
  (is (= "division" (hc/next-level "section")))
  (is (= "class"    (hc/next-level "group")))
  (is (nil?         (hc/next-level "class"))))

;; ── store seam (replaces RisingWave checkpointer) ────────────────────────────

(deftest store-default-write-returns-vertex-id
  (reset! store/mem-log [])
  (let [res (binding [store/repo-did "did:web:test.invalid"]
              (store/write-record! {:subject "Small Arms Co" :code "2520"}))]
    (is (string? (:vertex_id res)))
    (is (str/starts-with? (:vertex_id res) "at://did:web:test.invalid/"))
    (is (re-find #"com\.etzhayyim\.apps\.openIsic\.classification" (:vertex_id res)))
    (is (= 1 (count @store/mem-log)))))

;; ── cron spec loading + fire-input shaping ───────────────────────────────────

(deftest cron-load-specs-filters
  (is (= [{"schedule" "*/30 * * * *" "graph" "classify_entity"}]
         (cron/load-cron-specs {"crons" [{"schedule" "*/30 * * * *" "graph" "classify_entity"}
                                         {"graph" "no-schedule"}
                                         {"schedule" "0 0 * * *"}
                                         "not-a-map"]}))))

(deftest cron-build-fire-input-rotation
  (testing "no rotation → base passthrough"
    (is (= {"k" 1} (cron/build-fire-input {"k" 1} 0))))
  (testing "_rotateSceneByEpoch → epoch-bucketed scene indices, flag stripped"
    (let [out (cron/build-fire-input {"_rotateSceneByEpoch" true} (* 1800 3))]
      (is (= [3 4] (get out "scene_indices")))
      (is (not (contains? out "_rotateSceneByEpoch"))))))

(deftest cron-start-empty-is-nil
  (is (nil? (cron/start-cron {"health" :g} {:langgraph-json-path "/nonexistent.json"}))))

(deftest cron-disabled-is-an-explicit-capability
  (binding [cron/*config* {:enabled? false :langgraph-json "/not-read.json"}]
    (is (nil? (cron/start-cron {"health" :g})))))
