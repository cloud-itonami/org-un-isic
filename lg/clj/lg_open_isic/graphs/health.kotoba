(ns lg-open-isic.graphs.health
  "open-isic `health` graph — liveness probe (faithful clj port of
  `lg/lg_open_isic/graphs/health.py`, ADR-2606280030).

  Topology (identical to the Python): START → check → END. The `check` node
  returns {:ok true} immediately (no I/O), so the server can confirm a graph
  compiles + invokes. cljc-portable (no host deps)."
  (:require [langgraph.graph :as g]))

(defn node-check
  "Mirror of `_check`: return {:ok true} unconditionally."
  [_state]
  {:ok true})

(defn build
  "Compile the health StateGraph (START → check → END)."
  []
  (-> (g/state-graph)
      (g/add-node :check node-check)
      (g/set-entry-point :check)
      (g/set-finish-point :check)
      (g/compile-graph)))

(def GRAPH (build))
