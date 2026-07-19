#!/usr/bin/env bb
;; lg-open-isic — bb-native test runner (clojure.test; no shell). ADR-2606280030.
;;
;; Per the repo-wide rule (root CLAUDE.md §"Operational code = clj/bb"): new
;; first-party tooling is clj/bb, NOT shell. This is the .clj runner the repo
;; rule mandates for ported actors/apps (replaces run_tests.sh).
;;
;;   bb run_tests.clj          ; from 60-apps/etzhayyim-project-open-isic/lg/
;;   bb test                   ; via the scoped bb.edn task
(ns lg-open-isic.test-runner
  (:require [clojure.test :as t]))

(def suites
  '[lg-open-isic.test-graphs
    lg-open-isic.test-server])

(apply require suites)

(let [{:keys [fail error]} (apply t/run-tests suites)]
  (if (zero? (+ fail error))
    (println "── lg-open-isic: ALL suites green ──")
    (do (println "── lg-open-isic: FAILURES above ──")
        (System/exit 1))))
