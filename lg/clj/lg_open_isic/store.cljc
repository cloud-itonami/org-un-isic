(ns lg-open-isic.store
  "Injectable store seam — clj replacement for `lg/lg_open_isic/checkpointer.py`
  (the RW-compat `_RwAsyncPostgresSaver`), ADR-2606280030.

  SUBSTRATE-BOUNDARY (CLAUDE.md / MIGRATION-TODO): the Python checkpointer
  writes LangGraph checkpoints to RisingWave PG :4566. RisingWave / Postgres are
  DEPRECATED per the charter (ADR-2605262130); the canonical persistence target
  is the kotoba Datom log (Datomic-isomorphic, swappable per the actor `:db-api`
  pattern). This namespace therefore does NOT port the RW SQL. It exposes a
  single injectable `*write-record!*` write seam plus an in-memory default, so
  the classification graphs persist their result through one boundary fn that a
  human can later point at the kotoba Datom log without touching graph topology.

  Contract of `*write-record!*`:
    (write-record! record-map) → {:vertex_id <str>} | {:error <str>} | {}
  The default appends to an in-process atom (`mem-log`) and returns a synthetic
  vertex id, so graphs verify end-to-end under bb with no external store."
  (:require [clojure.string :as str]))

(def ^:dynamic repo-did
  "Repository DID supplied by the host adapter when deployment configuration
  differs from the safe public default."
  "did:web:open-isic.etzhayyim.com")

;; In-memory Datom-ish append log standing in for the kotoba Datom store.
(def mem-log (atom []))

(defn- vertex-id
  "Synthetic vertex id mirroring `classificationVertexId` shape
  (at://<repo>/com.etzhayyim.apps.openIsic.classification/<key>)."
  [record]
  (let [key (-> (str (or (:subject record) (:entity record) "anon"))
                str/lower-case
                (str/replace #"[^a-z0-9]+" "-")
                (str/replace #"(^-+|-+$)" ""))
        code (or (:code record) "0000")]
    (str "at://" repo-did "/com.etzhayyim.apps.openIsic.classification/"
         (if (str/blank? key) "anon" key) "-" code)))

(defn default-write-record!
  "Default store write: append to the in-memory Datom log and return the
  synthetic vertex id. Pure-enough for tests; swap for a kotoba Datom-log
  transactor in deployment via `*write-record!*`."
  [record]
  (let [vid (vertex-id record)]
    (swap! mem-log conj (assoc record :vertex_id vid))
    {:vertex_id vid}))

(def ^:dynamic *write-record!* default-write-record!)

(defn write-record!
  "Public entry the graphs call — delegates to the injectable seam."
  [record]
  (*write-record!* record))
