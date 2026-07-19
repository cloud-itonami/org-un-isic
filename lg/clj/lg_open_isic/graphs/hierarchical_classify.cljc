(ns lg-open-isic.graphs.hierarchical-classify
  "open-isic `hierarchical_classify` graph — dynamic LLM drill-down through the
  ISIC Rev.4 hierarchy (Section → Division → Group → Class).

  NSID: com.etzhayyim.apps.openIsic.hierarchicalClassify
  clj port (ADR-2606280030) of the Python `graphs/hierarchical_classify.py`, a
  thin re-export of `kotodama.langgraph_graphs.open_isic_hierarchical_classify`.

  PORT NOTE (deviation): the kotodama `build_graph()` is in an external crate not
  present in this app tree, so this twin reconstructs the DOCUMENTED behaviour
  (app CLAUDE.md): 'Dynamic LLM drill-down from Section → Division → Group →
  Class using the com.etzhayyim.apps.openIsic.getTaxonomy tool.' Two injectable
  seams stand in for the tool + the LLM choice:
    *fetch-taxonomy* (level path) → seq of {:code :nameEn} candidate children
    *pick*           (subject level candidates) → selected {:code :nameEn}|nil
  The drill loop is expressed with langgraph-clj `add-conditional-edges`: the
  `drill` node re-enters itself one level at a time until the `class` level is
  resolved, then routes to `write_record`. (Faithful to a Pregel drill-down;
  langgraph-clj's recursion-limit guards runaway loops, replacing any python
  RetryPolicy/recursion cap.) Persistence → the kotoba Datom-log store seam,
  NOT RisingWave (substrate boundary)."
  (:require [clojure.string :as str]
            [langgraph.graph :as g]
            [lg-open-isic.graphs.classify-entity :as ce]
            [lg-open-isic.store :as store]))

(def levels ["section" "division" "group" "class"])

(defn next-level [level]
  (let [i (.indexOf ^java.util.List levels level)]
    (when (and (>= i 0) (< (inc i) (count levels)))
      (nth levels (inc i)))))

;; ── injectable seams ─────────────────────────────────────────────────────────

(def ^:dynamic *fetch-taxonomy*
  "Default getTaxonomy: no static hierarchy wired offline — tests inject, and
  deployment points this at the com.etzhayyim.apps.openIsic.getTaxonomy tool."
  (fn [_level _path] []))

(def ^:dynamic *pick*
  "Default child-selection: reuse the classify-entity Murakumo classifier guard
  shape. Offline, tests inject a deterministic chooser."
  (fn [_subject _level candidates] (first candidates)))

;; ── nodes ────────────────────────────────────────────────────────────────────

(defn node-validate [state]
  (let [subject (str/trim (or (:subject state) (:entity state) (:text state) ""))]
    (if (str/blank? subject)
      {:error "subject is required"}
      {:subject subject :level "section" :path []})))

(defn node-drill
  "Resolve the current hierarchy level: fetch candidate children, let the picker
  choose one, advance to the next level. Sets :done when the `class` level lands."
  [state]
  (if (:error state)
    {}
    (let [level (or (:level state) "section")
          path  (or (:path state) [])
          cands (*fetch-taxonomy* level path)]
      (if (empty? cands)
        {:error (str "no taxonomy candidates at level " level)}
        (let [picked (*pick* (:subject state) level cands)]
          (if (nil? picked)
            {:error (str "picker returned no choice at level " level)}
            (let [path' (conj path {:level level :code (:code picked) :nameEn (:nameEn picked)})]
              (if (= level "class")
                {:path path' :code (:code picked) :nameEn (:nameEn picked) :done true}
                {:path path' :level (next-level level)}))))))))

(defn node-write-record [state]
  (if (or (:error state) (nil? (:code state)))
    {}
    (let [res (store/write-record!
               {:subject (:subject state) :code (:code state) :nameEn (:nameEn state)
                :path (:path state) :verification "authoritative"
                :graph "hierarchical_classify"})]
      (cond-> {}
        (:vertex_id res) (assoc :vertex_id (:vertex_id res))
        (:error res)     (assoc :error (:error res))))))

(defn drill-router
  "After a drill superstep: error → END, class resolved → write_record, else
  loop back into drill for the next level."
  [state]
  (cond
    (:error state) g/END
    (:done state)  :write_record
    :else          :drill))

(defn build
  "Compile the hierarchical_classify StateGraph (validate → drill* → write_record)."
  []
  (-> (g/state-graph)
      (g/add-node :validate node-validate)
      (g/add-node :drill node-drill)
      (g/add-node :write_record node-write-record)
      (g/add-edge :validate :drill)
      (g/add-conditional-edges :drill drill-router)
      (g/set-entry-point :validate)
      (g/set-finish-point :write_record)
      (g/compile-graph)))

(def GRAPH (build))

;; Re-export the shared verification rule so callers of either classifier graph
;; can reach it from one place (parity with the UDF surface).
(def verification-for-confidence ce/verification-for-confidence)
