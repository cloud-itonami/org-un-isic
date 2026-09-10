#!/usr/bin/env nbb
;; Breaks facts.edn one way at a time and requires verify-facts.cljs to object
;; FOR THE REASON IT NAMES.
;;
;;   nbb scripts/mutation-check.cljs              (structural only -- no network)
;;   nbb scripts/mutation-check.cljs --network    (also the fetching branches)
;;
;; WHY THE REASON AND NOT THE COLOUR.
;; A negative test that asserts only "the run went red" counts a run that went
;; red for an unrelated cause as a discriminating one. Every mutation below
;; declares the exit code AND the :reason token it must produce, and a run that
;; goes red the wrong way is a MISMATCH, not a pass. This workspace has watched
;; four separate agents ship the weaker form in a single day.
;;
;; WHY MOST OF THEM COST NOTHING.
;; verify-facts.cljs answers everything it can know without the network first,
;; under --static. A miscounted coverage block is knowable before the first
;; request, so the structural half of this suite runs in milliseconds and puts
;; no load on the authority.
;;
;; WHY THE NETWORK HALF IS OPT-IN AND PACED.
;; Neither host this register cites has been measured to serve a bot challenge
;; to a paced client -- but the e-Gov law API starts answering HTML when hammered,
;; and burst behaviour is exactly what a mutation suite is, so the network half
;; stays opt-in and paced either way. The network mutations therefore run against a MINIMAL subset
;; of the register, one at a time, spaced; and a run that comes back
;; :challenge-interposed is reported INCONCLUSIVE rather than counted either
;; way, because a blocked run establishes nothing about the mutation.

(ns mutation-check
  (:require [clojure.edn :as edn]
            [clojure.string :as str]
            [promesa.core :as p]
            ["fs" :as fs]
            ["os" :as os]
            ["path" :as path]
            ["child_process" :as cp]
            ["process" :as process]))

(def argv (vec (drop 2 (js->clj (.-argv process)))))
(def network? (boolean (some #{"--network"} argv)))
(defn- flag [name default]
  (let [i (.indexOf (into-array argv) name)]
    (if (and (>= i 0) (< (inc i) (count argv))) (nth argv (inc i)) default)))

(def base-path (flag "--facts" "facts.edn"))

;; --verifier points this suite at a DELIBERATELY BROKEN copy of the verifier,
;; to check that a given check is load-bearing: neuter one branch and exactly
;; the mutation that branch catches must stop being caught, while every other
;; mutation still is. If they all go red, the wrong thing was broken and the
;; demonstration proves nothing -- a failure mode this workspace hit four times
;; in one day.
(def verifier-path (flag "--verifier" "scripts/verify-facts.cljs"))

;; --only re-runs named mutations. The suite reports INCONCLUSIVE when a bot
;; challenge stood in the way and tells you to re-run rather than reading it as
;; a pass; this is how you do that without replaying the whole suite and
;; re-tripping the thing that blocked it.
(def only (let [v (flag "--only" nil)]
            (when v (into #{} (str/split v #",")))))

;; Seconds of quiet between network mutations. The default is deliberately
;; large: the page mutations re-ask the same few URLs, and a same-URL burst is
;; measurably what trips these hosts' bot challenge -- five requests to one page
;; in six seconds did it on 2026-08-26.
(def gap-ms (* 1000 (js/parseInt (flag "--gap" "30"))))

(def base-text (fs/readFileSync base-path "utf8"))
(def base-data (edn/read-string base-text))

(defn- sleep [ms] (p/create (fn [res _] (js/setTimeout #(res nil) ms))))

(defn- tmpfile [suffix]
  (path/join (os/tmpdir) (str "isic-mutation-" suffix ".edn")))

(defn- run-verifier
  "Returns {:exit :out}. Written to a file and read back rather than piped:
  in a shell, $? after a pipe is the LAST command's status, and this suite
  exists to stop exactly that class of mistake."
  [facts-file static?]
  (let [args (cond-> [verifier-path "--facts" facts-file]
               static? (conj "--static")
               (not static?) (into ["--pace" "3000"]))
        r (cp/spawnSync "nbb" (clj->js args)
                        #js {:encoding "utf8" :timeout 600000})]
    {:exit (if (nil? (.-status r)) 124 (.-status r))
     :out (str (.-stdout r) (.-stderr r))}))

;; --- the register, and a minimal one for the network half ----------------

(defn- recount
  "Rewrite the :coverage entity so a subset register is self-consistent.
  Without this every subset run would fail on the coverage block instead of on
  the mutation under test."
  [data]
  (let [sourced (filterv :source/url data)
        by (frequencies (map :source/verify sourced))]
    (mapv (fn [e]
            (if (= :coverage (:source/kind e))
              (assoc e :coverage/entries (count sourced) :coverage/by-verify by)
              e))
          data)))

(defn- subset [ids]
  (recount (filterv #(or (= :coverage (:source/kind %)) (ids (:source/id %))) base-data)))

(def LAW-FIXTURE
  "A :e-gov-law-id entry appended as a FIXTURE, because this register cites no
  statute and the law branch still has to be mutation-tested.

  It is a real law id with its real title and number, fetched once when this
  suite was written; the nonexistent-law mutation below replaces the id, and
  the title/num drift mutations corrupt the strings, so no mutation ever
  asserts the fixture's content as a citation. It never lands in facts.edn --
  it exists only inside this suite, against the e-Gov API, which is the part
  that pushes back least."
  {:source/id "fixture.law"
   :source/kind :statute
   :source/title "FIXTURE law (not a register citation)"
   :source/url "https://laws.e-gov.go.jp/law/330AC0000000179"
   :source/verify :e-gov-law-id
   :egov/law-id "330AC0000000179"
   :egov/law-title "補助金等に係る予算の執行の適正化に関する法律"
   :egov/law-num "昭和三十年法律第百七十九号"
   :source/note "FIXTURE. Exists only inside this suite; never a register entry."})

(def laws-only
  "The fixture law and nothing else -- no page entries, and therefore no host
  entities either.

  The law branch is tested against THIS, because the e-Gov API is not the part
  that pushes back: it answered twenty-two consecutive lookups while the
  sibling ministry register was built, whereas agency hosts there serve a bot
  challenge when asked too often. Testing the law branch against a page-bearing
  register would put needless agency requests behind each mutation."
  (recount (conj (filterv #(= :coverage (:source/kind %)) base-data) LAW-FIXTURE)))

(def UNROUTABLE-HOST
  "A :host-behaviour on a host that cannot resolve.

  .invalid is reserved by RFC 2606 and is guaranteed never to resolve, so this
  produces a refusal from the FIXTURE rather than from the weather -- no agency
  host has to be slow or blocked for the mutation below to mean something.

  A host entity and not a page, on purpose: a register that cites no page skips
  the four page self-tests, so this whole mutation costs one e-Gov lookup and
  one DNS failure and touches no challenged host at all. A page would have
  dragged the self-test pool, and its bot challenge, back in."
  [{:source/id "host.unroutable-fixture-invalid"
    :source/kind :host-behaviour
    :host/name "no-such-host.invalid"
    :host/missing-path :refuses-or-challenges
    :host/missing-status 403
    :source/note "FIXTURE. RFC 2606 reserved TLD; never resolves."}])

(def with-pages
  "One law plus the two front pages that give the self-test pool two hosts, and
  one :page-text entry -- the smallest register that still reaches the page
  branches."
  (subset #{"host.unstats-un-org" "host.ec-europa-eu"
            "un.isic-landing" "un.econ-index" "eurostat.nace-landing"
            "un.cpc-landing"}))

;; --- mutation helpers ----------------------------------------------------

(defn- alter-entity [data id f]
  (mapv #(if (= id (:source/id %)) (f %) %) data))

(defn- alter-coverage [data f]
  (mapv #(if (= :coverage (:source/kind %)) (f %) %) data))

;; --- the mutations -------------------------------------------------------
;; :want-exit and :want-reason are both asserted. :want-reason is matched as a
;; literal token in the output, so a rename upstream breaks this suite -- which
;; is the point: pinning the reason is what makes the assertion mean anything.

(def structural
  [{:id "coverage-entry-count"
    :why "a source added without updating :coverage/entries"
    :mutate #(alter-coverage % (fn [c] (update c :coverage/entries inc)))
    :want-exit 1 :want-reason ":coverage/entries says"}

   {:id "coverage-by-verify"
    :why "the per-check tally drifting from the file"
    :mutate #(alter-coverage % (fn [c] (assoc c :coverage/by-verify {:e-gov-law-id 1})))
    :want-exit 1 :want-reason ":coverage/by-verify says"}

   {:id "duplicate-source-id"
    :why "the join key stops being a key"
    :mutate #(alter-entity % "un.cpc-landing" (fn [e] (assoc e :source/id "un.isic-landing")))
    :want-exit 1 :want-reason "duplicate :source/id"}

   {:id "duplicate-source-url"
    :why "the same source counted twice under two ids"
    :mutate #(alter-entity % "un.cpc-landing"
                           (fn [e] (assoc e :source/url "https://unstats.un.org/unsd/classifications/Econ/isic")))
    :want-exit 1 :want-reason "duplicate :source/url"}

   {:id "unknown-verify-tag"
    :why "a tag no check knows how to run"
    :mutate #(alter-entity % "un.isic-landing" (fn [e] (assoc e :source/verify :vibes)))
    :want-exit 2 :want-reason "unknown-verify"}

   {:id "page-text-without-needles"
    :why "a declared :page-text check with nothing to check"
    :mutate #(alter-entity % "un.cpc-landing" (fn [e] (dissoc e :page/must-contain)))
    :want-exit 2 :want-reason "no-needles"}

   {:id "needles-nothing-reads"
    :why "must-contain on a :page-identity entry, so nothing reads it"
    :mutate #(alter-entity % "un.econ-index"
                           (fn [e] (assoc e :page/must-contain ["never read"])))
    :want-exit 1 :want-reason "unchecked-needles"}

   {:id "coverage-entity-removed"
    :why "a register that never says what it leaves out"
    :mutate #(filterv (fn [e] (not= :coverage (:source/kind e))) %)
    :want-exit 1 :want-reason "no :coverage entity"}

   {:id "page-on-undeclared-host"
    :why "a page whose host has no measured :host-behaviour behind it"
    :mutate #(alter-entity % "un.econ-index"
                           (fn [e] (assoc e :source/url "https://www.example.org/")))
    :want-exit 1 :want-reason "no :host-behaviour entity"}

   {:id "all-pages-on-one-host"
    :why "a self-test pool on one host, which would burst that host"
    :mutate (fn [data]
              (mapv (fn [e]
                      (if (and (= :page-identity (:source/verify e))
                               (not= "eurostat.nace-landing" (:source/id e)))
                        (assoc e :source/verify :page-text
                                 :page/must-contain ["x"])
                        e))
                    data))
    :want-exit 2 :want-reason "is on one host"}

   {:id "empty-register"
    :why "an empty register is not a clean register"
    :mutate (fn [_] [])
    :want-exit 2 :want-reason "declares 0 sources"}

   {:id "no-host-behaviour"
    :why "page checks resting on an assumption nothing measures"
    :mutate #(filterv (fn [e] (not= :host-behaviour (:source/kind e))) %)
    :want-exit 2 :want-reason "declares no :host-behaviour"}])

(def structural-text
  "Mutations that have to be made to the TEXT, because they are about what the
  reader does with malformed input and cannot be expressed as data."
  [{:id "entity-appended-after-close"
    :why "an entity after the closing bracket, which edn/read-string discards silently"
    :mutate-text #(str % "\n{:source/id \"ghost\" :source/verify :page-identity}\n")
    :want-exit 2 :want-reason "top-level forms"}

   {:id "broken-edn"
    :why "a register that does not read at all"
    :mutate-text #(str/replace-first % "[" "[{:unclosed ")
    :want-exit 2 :want-reason "cannot read"}])

(def network
  [{:id "nonexistent-law" :on :laws-only
    :why "an invented law id, whose /law/ URL still answers 200"
    :mutate #(alter-entity % "fixture.law" (fn [e] (assoc e :egov/law-id "999ZZ9999999999")))
    :want-exit 1 :want-reason "nonexistent-law"}

   {:id "law-title-drift" :on :laws-only
    :why "a real id recorded under the wrong title"
    :mutate #(alter-entity % "fixture.law" (fn [e] (assoc e :egov/law-title "補助金法")))
    :want-exit 1 :want-reason "law-title-drift"}

   {:id "law-num-drift" :on :laws-only
    :why "a real id recorded under the wrong law number"
    :mutate #(alter-entity % "fixture.law" (fn [e] (assoc e :egov/law-num "昭和三十年法律第百八十号")))
    :want-exit 1 :want-reason "law-num-drift"}

   ;; THE ONLY MUTATION HERE THAT BREAKS THE REGISTER IN TWO PLACES AT ONCE,
   ;; because the thing under test is which of the two the verifier reports.
   ;; It is also the only one that EXPECTS a blockage, so it names the KIND it
   ;; expects. Without that the guard in `verdict` would read the BLOCKED token
   ;; this mutation deliberately causes and call the run inconclusive, and the
   ;; mutation could never be caught. Naming the kind rather than setting a
   ;; boolean keeps the safety: a bot challenge, which is a DIFFERENT kind,
   ;; still makes this run inconclusive like every other.
   {:id "fail-outranks-refusal" :on :laws-only
    :expects-blocked "unreachable"
    :why (str "a register with a real finding AND an unreachable source at the "
              "same time. The finding has to win: a host that could not be "
              "reached establishes nothing about a law that WAS looked up and "
              "found wrong, so it must not turn exit 1 into exit 2. Before "
              "2026-08-29 it did, and that is how one intermittently blocked "
              "page hid a register error for as long as it stayed blocked -- "
              "observed on the live register with pass=31 fail=1 refused=1 "
              "reported as 'could not answer'.")
    :mutate (fn [d]
              (recount
                (-> d
                    (alter-entity "fixture.law"
                                  (fn [e] (assoc e :egov/law-title "補助金法")))
                    (into UNROUTABLE-HOST))))
    :want-exit 1 :want-reason "law-title-drift"}

   {:id "page-title-drift"
    :why "a real page recorded under a title it does not carry"
    :mutate #(alter-entity % "un.econ-index" (fn [e] (assoc e :page/title "UNSD")))
    :want-exit 1 :want-reason "title-drift"}

   {:id "missing-text"
    :why "a string the page does not contain"
    :mutate #(alter-entity % "un.cpc-landing"
                           (fn [e] (assoc e :page/must-contain ["CPC Ver. 3.0"])))
    :want-exit 1 :want-reason "missing-text"}

   {:id "charset-drift"
    :why "a UTF-8 page declared as Shift_JIS -- every Japanese string would be compared against mojibake"
    :mutate #(alter-entity % "eurostat.nace-landing" (fn [e] (assoc e :page/charset "shift_jis")))
    :want-exit 1 :want-reason "charset-drift"}

   {:id "unexpected-redirect"
    :why "a URL that lands somewhere other than where it asked"
    :mutate #(alter-entity % "un.econ-index"
                           (fn [e] (assoc e :source/url "http://unstats.un.org/unsd/classifications/Econ")))
    :want-exit 1 :want-reason "unexpected-redirect"}

   {:id "not-2xx"
    :why "a cited page that is not there"
    :mutate #(alter-entity % "un.econ-index"
                           (fn [e] (assoc e :source/url "https://unstats.un.org/unsd/no-such-zzz.html")))
    :want-exit 1 :want-reason "not-2xx"}

   {:id "host-status-drift"
    :why "a host whose refusal is not the refusal the register measured"
    :mutate #(alter-entity % "host.unstats-un-org"
                           (fn [e] (assoc e :host/missing-status 403)))
    :want-exit 1 :want-reason "host-status-drift"}])

;; --- driving -------------------------------------------------------------

(defn- verdict [m {:keys [exit out]}]
  (let [reason-seen (str/includes? out (:want-reason m))
        ;; Match the sentence the verifier writes ONLY when a challenge
        ;; actually stood in the way. Two earlier attempts at this were wrong
        ;; in opposite directions, and both are worth keeping written down:
        ;;
        ;;   "challenge-interposed"        also appears in the challenge
        ;;                                 self-test's SUCCESS line, so every
        ;;                                 run looked blocked -- three law
        ;;                                 mutations that were caught correctly
        ;;                                 were reported as never tested.
        ;;   "REFUSED[challenge-interposed]"
        ;;                                 misses the case where the challenge
        ;;                                 blocks a SELF-TEST instead of a
        ;;                                 source: the run then refuses with
        ;;                                 "self-test did not discriminate" and
        ;;                                 no bracketed reason line, so a
        ;;                                 blocked run was reported as the
        ;;                                 verifier failing to discriminate.
        ;;
        ;; The first made a working check look broken; the second made a
        ;; blocked run look like a broken check. Neither is the truth, which is
        ;; "this mutation was not tested".
        ;; A TOKEN the verifier emits, not prose. Three prose markers were
        ;; tried first and all three collided with text that appears in runs
        ;; that were never blocked -- including the verifier's own explanation
        ;; of what trips a challenge. See the note beside `blocked` in
        ;; verify-facts.cljs.
        ;; Which KINDS of blockage this run reported. Until 2026-08-29 this
        ;; matched "BLOCKED\tchallenge" exactly, so a run stopped by a TIMEOUT
        ;; -- which emitted no token at all -- came back here as exit 2 with
        ;; the wanted reason somewhere in the output, and was reported
        ;; WRONG-EXIT: "the verifier does not discriminate". The verifier was
        ;; fine. The run had not happened.
        blocked-kinds (into #{} (map second)
                            (re-seq #"BLOCKED\t(\w+)\t" out))
        ;; A mutation may declare ONE kind as part of its own fixture. Any
        ;; OTHER kind still makes the run inconclusive -- otherwise the one
        ;; mutation that expects a blockage would silently accept a run that a
        ;; bot challenge had actually stopped.
        challenged (seq (disj blocked-kinds (:expects-blocked m)))]
    (cond
      ;; A blocked run says nothing about the mutation. Not a pass, not a fail.
      ;; UNLESS the mutation is the one that deliberately causes the blockage:
      ;; for that one the blockage is half the fixture, and treating it as
      ;; "not tested" would make the only check of the fail-beats-refusal
      ;; ordering permanently unrunnable.
      (and challenged (not (str/includes? (:want-reason m) "challenge")))
      {:state :inconclusive
       :note (str (str/join " and " (sort challenged))
                  " stood in the way (exit " exit
                  "), so this mutation was not actually tested")}

      (and (= exit (:want-exit m)) reason-seen)
      {:state :caught :note (str "exit " exit ", reason " (pr-str (:want-reason m)))}

      (= exit 0)
      {:state :missed :note "the verifier reported OK on a register that is wrong"}

      (not reason-seen)
      {:state :wrong-reason
       :note (str "went red (exit " exit ") but never named " (pr-str (:want-reason m))
                  " -- red for some other cause is not a discriminating run")}

      :else
      {:state :wrong-exit
       :note (str "named the reason but exited " exit ", wanted " (:want-exit m))})))

(defn- apply-one [m data static?]
  (let [f (tmpfile (:id m))]
    (if-let [mt (:mutate-text m)]
      (fs/writeFileSync f (mt (if static? (pr-str data) base-text)) "utf8")
      (fs/writeFileSync f (pr-str ((:mutate m) data)) "utf8"))
    (let [r (run-verifier f static?)]
      (fs/unlinkSync f)
      (assoc (verdict m r) :id (:id m) :why (:why m)))))

(defn- report [rs]
  (doseq [r rs]
    (println (str "  " (case (:state r)
                         :caught "CAUGHT      "
                         :missed "MISSED      "
                         :wrong-reason "WRONG-REASON"
                         :wrong-exit "WRONG-EXIT  "
                         :inconclusive "INCONCLUSIVE")
                  "\t" (:id r) "\t" (:note r))))
  rs)

(defn- wanted [ms] (if only (filterv #(only (:id %)) ms) ms))

(p/let [_ (println (str "── structural mutations (no network) ──────────────────────────"
                        (when only (str "\n   --only " (pr-str (vec only))))))
        struct-rs (p/loop [rem (wanted (into structural structural-text)) acc []]
                    (if (empty? rem)
                      acc
                      (let [m (first rem)]
                        (p/recur (vec (rest rem))
                                 (conj acc (apply-one m base-data true))))))
        _ (report struct-rs)
        net-rs (if-not network?
                 (do (println "\n── network mutations SKIPPED (pass --network to run them) ─────")
                     [])
                 (p/let [_ (println (str "\n── network mutations, paced ("
                                         (count (filter #(= :laws-only (:on %)) (wanted network)))
                                         " on a laws-only register, "
                                         (count (remove #(= :laws-only (:on %)) (wanted network)))
                                         " needing agency pages) ──"))
                         rs (p/loop [rem (wanted network) acc []]
                              (if (empty? rem)
                                acc
                                (p/let [m (first rem)
                                        r (apply-one m (if (= :laws-only (:on m))
                                                         laws-only with-pages)
                                                     false)
                                        _ (report [r])
                                        _ (when (seq (rest rem)) (sleep gap-ms))]
                                  (p/recur (vec (rest rem)) (conj acc r)))))]
                   rs))]
  (let [all (into struct-rs net-rs)
        caught (filterv #(= :caught (:state %)) all)
        incon (filterv #(= :inconclusive (:state %)) all)
        bad (filterv #(#{:missed :wrong-reason :wrong-exit} (:state %)) all)]
    (println (str "\ncaught=" (count caught) " inconclusive=" (count incon)
                  " not-caught=" (count bad) " of " (count all)))
    (when (seq incon)
      (println (str "⚠ " (count incon) " mutation(s) were never actually tested. "
                    "Re-run them; do not read this as a pass.")))
    (cond
      (seq bad) (do (println "FAIL\tthe verifier does not discriminate these")
                    (.exit process 1))
      (seq incon) (do (println "REFUSED\tsome mutations could not be tested")
                      (.exit process 2))
      :else (do (println (str "OK\t" (count caught) " mutation(s), each caught by its own reason"))
                (.exit process 0)))))
