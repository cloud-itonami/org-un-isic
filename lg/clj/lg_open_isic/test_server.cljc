(ns lg-open-isic.test-server
  "clojure.test port of `tests/test_smoke.py` — server / NSID / langgraph.json
  parity for the lg-open-isic clj twin (ADR-2606280030)."
  (:require [clojure.test :refer [deftest is]]
            [cheshire.core :as json]
            [langchain.runnable :as r]
            [lg-open-isic.server :as srv]))

(def expected-graphs #{"health" "classify_entity" "hierarchical_classify"})

(def expected-nsid-map
  {"com.etzhayyim.apps.openIsic.classifyEntity"       "classify_entity"
   "com.etzhayyim.apps.openIsic.hierarchicalClassify" "hierarchical_classify"})

;; ── registry parity (mirrors test_smoke.py) ────────────────────────────────

(deftest graphs-match-expected-set
  (is (= expected-graphs (set (keys srv/GRAPHS)))))

(deftest nsid-map-completeness
  (is (= expected-nsid-map srv/NSID->ASSISTANT)))

(deftest nsid-map-references-known-graphs
  (doseq [[_ gname] srv/NSID->ASSISTANT]
    (is (contains? srv/GRAPHS gname))))

(deftest all-graphs-are-invocable
  (doseq [[_ graph] srv/GRAPHS]
    (is (satisfies? r/IRunnable graph))))

(def lg-dir
  (let [f (java.io.File. ^String (str *file*))]
    ;; clj/lg_open_isic/test_server.cljc → lg/ is three parents up.
    (.getParentFile (.getParentFile (.getParentFile (.getAbsoluteFile f))))))

(deftest langgraph-json-graphs-match-server
  ;; langgraph.json declares `health` plus the two classifiers — same set the
  ;; server registers (the python server.py registers all three).
  (let [cfg (json/parse-string (slurp (java.io.File. lg-dir "langgraph.json")))
        declared (set (keys (get cfg "graphs")))]
    (is (= declared (set (keys srv/GRAPHS))))))

(deftest langgraph-json-has-no-crons
  (let [cfg (json/parse-string (slurp (java.io.File. lg-dir "langgraph.json")))]
    (is (= [] (get cfg "crons" [])))))

;; ── handler routing (no socket) ────────────────────────────────────────────

(deftest ok-endpoint-lists-graphs
  (let [resp (srv/handler {:request-method :get :uri "/ok"})]
    (is (= 200 (:status resp)))
    (let [body (json/parse-string (:body resp) true)]
      (is (true? (:ok body)))
      (is (= expected-graphs (set (:graphs body)))))))

(deftest health-endpoint
  (let [resp (srv/handler {:request-method :get :uri "/health"})]
    (is (= 200 (:status resp)))
    (is (true? (:ok (json/parse-string (:body resp) true))))))

(deftest unknown-assistant-404
  (let [resp (srv/handler {:request-method :post :uri "/runs"
                           :body (json/generate-string {:assistant_id "nope" :input {}})})]
    (is (= 404 (:status resp)))))

(deftest unknown-nsid-xrpc-404
  (let [resp (srv/handler {:request-method :post
                           :uri "/xrpc/com.etzhayyim.apps.openIsic.unknownMethod"
                           :body "{}"})]
    (is (= 404 (:status resp)))))

(deftest thread-state-defaults-to-classify-entity
  (let [resp (srv/handler {:request-method :get :uri "/threads/t1/state"})]
    (is (= 200 (:status resp)))
    (is (= "t1" (:thread_id (json/parse-string (:body resp) true))))))

(deftest api-key-guard
  (binding [srv/*api-key* "secret"]
    (let [resp (srv/handler {:request-method :post :uri "/runs"
                             :headers {"x-api-key" "wrong"}
                             :body (json/generate-string {:assistant_id "health"})})]
      (is (= 401 (:status resp))))))

(deftest server-start-requires-explicit-capability
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"explicit HTTP server capability required"
                        (srv/start! nil {:port 0}))))

(deftest key-normalization
  (is (= {:object-type "x" :subject-id "n1"}
         (srv/normalize-input {"objectType" "x" "subject_id" "n1"}))))
