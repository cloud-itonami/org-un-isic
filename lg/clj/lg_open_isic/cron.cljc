(ns lg-open-isic.cron
  "In-process cron spec loader — clj port of `lg/lg_open_isic/cron.py`
  (ADR-2606280030).

  The Python module registered APScheduler `CronTrigger` jobs read from
  `langgraph.json`'s `crons` array, with per-fire input shaping (the
  `_rotateSceneByEpoch` scene-index walk). open-isic's langgraph.json ships
  `crons: []`, so the scheduling runtime is effectively unused; what carries
  behaviour is the SPEC LOADING + the per-fire input shaping. Those are ported
  here as pure, testable fns.

  DEVIATION (noted in PR): APScheduler crontab scheduling is NOT reimplemented
  (no cron-expression scheduler under bb, and open-isic declares zero crons).
  `start-cron` returns nil when disabled or when no specs reference a known graph
  — behaviour-equivalent for open-isic's empty `crons`. The fire-input logic +
  spec filtering are faithful and covered by tests."
  (:require [clojure.string :as str]
            #?(:clj [cheshire.core :as json])))

(def ^:dynamic *config*
  "Host-supplied cron configuration. Portable code never reads process env."
  {:enabled? true :langgraph-json "/app/langgraph.json"})

(defn cron-enabled? []
  (true? (:enabled? *config*)))

(defn load-cron-specs
  "Filter a parsed langgraph.json `crons` array to entries that have both a
  :schedule and a :graph (faithful to `_load_cron_specs`)."
  [cfg]
  (->> (or (get cfg "crons") (get cfg :crons) [])
       (filter #(and (map? %)
                     (or (get % "schedule") (get % :schedule))
                     (or (get % "graph") (get % :graph))))
       vec))

(defn read-langgraph-json
  "Read + parse langgraph.json (host config or the given path). Returns
  {} on missing/invalid (logged), like `_load_cron_specs`'s guards."
  [path]
  #?(:clj
     (let [p (or path (:langgraph-json *config*))
           f (java.io.File. ^String p)]
       (if-not (.exists f)
         (do (binding [*out* *err*] (println (str "langgraph.json not found at " p))) {})
         (try (json/parse-string (slurp f))
              (catch Exception e
                (binding [*out* *err*]
                  (println (str "langgraph.json parse failed: " (.getMessage e))))
                {}))))
     :default {}))

(defn build-fire-input
  "Pure: shape one fire's graph input from a cron spec's base `input`, honoring
  `_rotateSceneByEpoch` (epoch-bucketed scene-index walk 0..4). `epoch-secs` is
  injected for determinism (defaults to wall clock under :clj)."
  ([base] (build-fire-input base #?(:clj (quot (System/currentTimeMillis) 1000) :default 0)))
  ([base epoch-secs]
   (let [rotate? (boolean (or (get base "_rotateSceneByEpoch") (get base :_rotateSceneByEpoch)))
         base'   (dissoc base "_rotateSceneByEpoch" :_rotateSceneByEpoch)]
     (if rotate?
       (let [idx (mod (quot epoch-secs 1800) 5)]
         (assoc base' "scene_indices" [idx (mod (inc idx) 5)]))
       base'))))

(defn fire-thread-id [graph-name epoch-secs]
  (str "cron:" graph-name ":" epoch-secs))

(defn start-cron
  "Port of `start_cron`. Returns nil when disabled or when no valid specs
  reference a known graph (open-isic ships zero crons → nil). A real scheduler is
  not booted (see DEVIATION); the function reports how many jobs WOULD register
  via the returned map, or nil for the no-op case."
  [graphs & [{:keys [langgraph-json-path]}]]
  (when (cron-enabled?)
    (let [specs (load-cron-specs (read-langgraph-json langgraph-json-path))
          jobs  (->> specs
                     (keep (fn [spec]
                             (let [gname (str (or (get spec "graph") (get spec :graph)))]
                               (when (contains? graphs gname)
                                 {:graph gname
                                  :schedule (str (or (get spec "schedule") (get spec :schedule)))
                                  :base-input (or (get spec "input") (get spec :input) {})}))))
                     vec)]
      (when (seq jobs)
        {:registered (count jobs) :jobs jobs}))))

(defn stop-cron [scheduler]
  (when scheduler :stopped))
