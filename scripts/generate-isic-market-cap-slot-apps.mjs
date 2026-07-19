#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const legacyActorRoot = path.join(projectRoot, 'legacy-actor-components');
const reportsRoot = path.join(projectRoot, 'reports');
const sourceReportPath = path.join(reportsRoot, 'market-cap-isic-top10.json');
const manifestPath = path.join(reportsRoot, 'isic-market-cap-slot-apps.json');

const sectionOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function appNanoid(section, rank) {
  return `${section.toLowerCase()}${pad2(rank)}mcap`;
}

function dirName(section, rank) {
  return `etzhayyim-legacy-public-company-isic-${section.toLowerCase()}-top-${pad2(rank)}-${appNanoid(section, rank)}`;
}

function packageName(section, rank) {
  return `etzhayyim:public-company-isic-${section.toLowerCase()}-top-${pad2(rank)}`;
}

function goModuleName(section, rank) {
  return `github.com/etzhayyim/etzhayyim-legacy-public-company-isic-${section.toLowerCase()}-top-${pad2(rank)}`;
}

function toGoString(value) {
  return JSON.stringify(value);
}

function buildSystemPrompt(slot) {
  if (slot.status === 'implemented') {
    return [
      `You are the self-growing market-cap actor for ISIC section ${slot.section} rank ${pad2(slot.rank)}.`,
      `Your current canonical company is ${slot.companyName} (${slot.ticker}) on ${slot.exchangeMic}.`,
      `Known facts: ISIC ${slot.isicCode}, market cap USD ${slot.marketCapUsd}, sector ${slot.sector}, industry ${slot.industry}.`,
      'Operate as a company-scoped analyst actor.',
      'Answer concisely, use the seeded company facts as canonical repo state, and identify gaps that should be evolved next.',
      'If asked about missing data, explicitly distinguish seeded repo facts from inferred or external-live facts.',
    ].join(' ');
  }
  return [
    `You are the self-growing market-cap actor for ISIC section ${slot.section} rank ${pad2(slot.rank)}.`,
    'This slot is not implemented yet.',
    `Your responsibility is to represent the missing company for the global market-cap top10 slot in ISIC ${slot.section}.`,
    'When asked, explain that this slot is planned, summarize the section context, and state which company metadata still needs to be added.',
  ].join(' ');
}

function mainGo(slot) {
  return `package main

import (
\t"encoding/json"
\t"fmt"
\t"strings"
\t"time"

\tkotodama "github.com/etzhayyim/root/40-engine/kotoba/crates/kotoba-kotodama-go"
)

const (
\tcomponentNanoID = ${toGoString(slot.nanoid)}
\tcomponentName   = ${toGoString(slot.appName)}
\tserviceDesc     = ${toGoString(slot.description)}
)

type slotInfo struct {
\tSection        string  \`json:"section"\`
\tSectionName    string  \`json:"section_name"\`
\tRank           int     \`json:"rank"\`
\tStatus         string  \`json:"status"\`
\tCoverageTarget string  \`json:"coverage_target"\`
\tMarketCapUSD   float64 \`json:"market_cap_usd"\`
\tTicker         string  \`json:"ticker,omitempty"\`
\tCompanyName    string  \`json:"company_name,omitempty"\`
\tExchangeMIC    string  \`json:"exchange_mic,omitempty"\`
\tISICCode       string  \`json:"isic_code,omitempty"\`
\tSector         string  \`json:"sector,omitempty"\`
\tIndustry       string  \`json:"industry,omitempty"\`
\tSourcePath     string  \`json:"source_path,omitempty"\`
}

type publicFact struct {
\tKey        string \`json:"key"\`
\tValueJSON  string \`json:"value_json"\`
\tVisibility string \`json:"visibility"\`
\tSource     string \`json:"source,omitempty"\`
\tUpdatedAt  string \`json:"updated_at,omitempty"\`
}

type messageRecord struct {
\tMessageID    string \`json:"message_id"\`
\tSessionID    string \`json:"session_id,omitempty"\`
\tDirection    string \`json:"direction"\`
\tFromActorID  string \`json:"from_actor_id,omitempty"\`
\tToActorID    string \`json:"to_actor_id,omitempty"\`
\tSubject      string \`json:"subject,omitempty"\`
\tContent      string \`json:"content"\`
\tVisibility   string \`json:"visibility"\`
\tCreatedAt    string \`json:"created_at"\`
\tOriginOrgID  string \`json:"origin_org_id,omitempty"\`
\tOriginUserID string \`json:"origin_user_id,omitempty"\`
\tOriginActorID string \`json:"origin_actor_id,omitempty"\`
}

var seedSlot = slotInfo{
\tSection:        ${toGoString(slot.section)},
\tSectionName:    ${toGoString(slot.sectionName)},
\tRank:           ${slot.rank},
\tStatus:         ${toGoString(slot.status)},
\tCoverageTarget: "global-market-cap-top10",
\tMarketCapUSD:   ${slot.marketCapUsd},
\tTicker:         ${toGoString(slot.ticker ?? '')},
\tCompanyName:    ${toGoString(slot.companyName ?? '')},
\tExchangeMIC:    ${toGoString(slot.exchangeMic ?? '')},
\tISICCode:       ${toGoString(slot.isicCode ?? '')},
\tSector:         ${toGoString(slot.sector ?? '')},
\tIndustry:       ${toGoString(slot.industry ?? '')},
\tSourcePath:     ${toGoString(slot.sourcePath ?? '')},
}

func init() {
\tapp := kotodama.NewApp(kotodama.AppDef{
\t\tID:          componentNanoID,
\t\tName:        componentName,
\t\tDescription: serviceDesc,
\t\tAgent: &kotodama.AgentConfig{
\t\t\tModel:        kotodama.DefaultMurakumoModel,
\t\t\tSystemPrompt: ${toGoString(buildSystemPrompt(slot))},
\t\t},
\t})
\tapp.Command("get_slot_info", handleGetSlotInfo,
\t\tkotodama.AsAgentTool("Get ISIC market-cap slot metadata"),
\t\tkotodama.WithCapabilityTags("public-company", "market-cap-slot", "isic-${slot.section.toLowerCase()}", "rank-${pad2(slot.rank)}", "${slot.status}"),
\t)
\tapp.Command("get_company_info", handleGetCompanyInfo,
\t\tkotodama.AsAgentTool("Get company metadata for this ISIC market-cap slot"),
\t\tkotodama.WithCapabilityTags("public-company", "company-profile", "isic-${slot.section.toLowerCase()}", "${slot.status}"),
\t)
\tapp.Command("get_growth_brief", handleGetGrowthBrief,
\t\tkotodama.AsAgentTool("Get evolution brief for this ISIC market-cap actor"),
\t\tkotodama.WithCapabilityTags("public-company", "growth-brief", "isic-${slot.section.toLowerCase()}", "${slot.status}"),
\t)
\tapp.Command("get_public_profile", handleGetPublicProfile,
\t\tkotodama.AsAgentTool("Get the public profile and published facts for this actor"),
\t\tkotodama.WithCapabilityTags("public-company", "public-profile", "isic-${slot.section.toLowerCase()}", "${slot.status}"),
\t)
\tapp.Command("list_public_facts", handleListPublicFacts,
\t\tkotodama.AsAgentTool("List published facts accumulated by this actor"),
\t\tkotodama.WithCapabilityTags("public-company", "public-facts", "isic-${slot.section.toLowerCase()}", "${slot.status}"),
\t)
\tapp.Command("upsert_public_fact", handleUpsertPublicFact,
\t\tkotodama.AsAgentTool("Publish or update a public fact for this actor"),
\t\tkotodama.WithCapabilityTags("public-company", "public-facts", "publisher", "isic-${slot.section.toLowerCase()}", "${slot.status}"),
\t)
\tapp.Command("list_messages", handleListMessages,
\t\tkotodama.AsAgentTool("List accumulated public conversation messages for this actor"),
\t\tkotodama.WithCapabilityTags("public-company", "conversation", "message-log", "isic-${slot.section.toLowerCase()}", "${slot.status}"),
\t)
\tapp.Command("receive_message", handleReceiveMessage,
\t\tkotodama.AsAgentTool("Receive and store a message for this actor"),
\t\tkotodama.WithCapabilityTags("public-company", "conversation", "inbox", "isic-${slot.section.toLowerCase()}", "${slot.status}"),
\t)
\tapp.Command("send_message", handleSendMessage,
\t\tkotodama.AsAgentTool("Send a message from this actor to another actor"),
\t\tkotodama.WithCapabilityTags("public-company", "conversation", "outbox", "isic-${slot.section.toLowerCase()}", "${slot.status}"),
\t)
\tapp.Command("start_conversation", handleStartConversation,
\t\tkotodama.AsAgentTool("Start a W Protocol conversation with other actors"),
\t\tkotodama.WithCapabilityTags("public-company", "conversation", "session", "isic-${slot.section.toLowerCase()}", "${slot.status}"),
\t)
\tapp.HandleConversationMessage(handleConversationMessage)
\tapp.OnDailyEvolution(func(_ *kotodama.AppContext) map[string]float64 {
\t\tensureSeedProfile()
\t\tif seedSlot.Status == "implemented" {
\t\t\treturn map[string]float64{"implemented": 1, "market_cap_usd": seedSlot.MarketCapUSD}
\t\t}
\t\treturn map[string]float64{"implemented": 0, "market_cap_usd": 0}
\t})
\tapp.Serve()
}

func main() {}

func handleGetSlotInfo(_ *kotodama.AppContext, _ []byte) ([]byte, error) {
\tensureSeedProfile()
\treturn mustJSON(seedSlot)
}

func handleGetCompanyInfo(_ *kotodama.AppContext, _ []byte) ([]byte, error) {
\tensureSeedProfile()
\tif seedSlot.Status != "implemented" {
\t\treturn nil, fmt.Errorf("slot %s-%02d is not implemented yet", seedSlot.Section, seedSlot.Rank)
\t}
\treturn mustJSON(map[string]any{
\t\t"ticker":        seedSlot.Ticker,
\t\t"name":          seedSlot.CompanyName,
\t\t"exchange_mic":  seedSlot.ExchangeMIC,
\t\t"isic_code":     seedSlot.ISICCode,
\t\t"market_cap_usd": seedSlot.MarketCapUSD,
\t\t"sector":        seedSlot.Sector,
\t\t"industry":      seedSlot.Industry,
\t\t"source_path":   seedSlot.SourcePath,
\t})
}

func handleGetGrowthBrief(_ *kotodama.AppContext, _ []byte) ([]byte, error) {
\tensureSeedProfile()
\tpayload := map[string]any{
\t\t"section": seedSlot.Section,
\t\t"rank":    seedSlot.Rank,
\t\t"status":  seedSlot.Status,
\t\t"goal":    "track the global market-cap top10 slot for this ISIC section as a self-growing actor",
\t}
\tif seedSlot.Status == "implemented" {
\t\tpayload["company"] = seedSlot.CompanyName
\t\tpayload["ticker"] = seedSlot.Ticker
\t\tpayload["next_growth_targets"] = []string{
\t\t\t"expand company facts beyond seeded metadata",
\t\t\t"add filings and source provenance",
\t\t\t"add subsidiaries and resource-flow decomposition",
\t\t}
\t} else {
\t\tpayload["next_growth_targets"] = []string{
\t\t\t"identify the correct company for this slot",
\t\t\t"add ticker, exchange, ISIC and market cap seed data",
\t\t\t"promote status from planned to implemented",
\t\t}
\t}
\treturn mustJSON(payload)
}

func handleGetPublicProfile(_ *kotodama.AppContext, _ []byte) ([]byte, error) {
\tensureSeedProfile()
\tfacts, err := loadPublicFacts(100)
\tif err != nil {
\t\treturn nil, err
\t}
\tmessageCount, err := countMessages()
\tif err != nil {
\t\treturn nil, err
\t}
\treturn mustJSON(map[string]any{
\t\t"app_id":             componentNanoID,
\t\t"component_name":     componentName,
\t\t"description":        serviceDesc,
\t\t"conversation_mode":  "wproto",
\t\t"seed_slot":          seedSlot,
\t\t"public_facts":       facts,
\t\t"public_message_count": messageCount,
\t\t"endpoint":           "https://" + componentNanoID + ".etzhayyim.com/xrpc",
\t})
}

func handleListPublicFacts(_ *kotodama.AppContext, payload []byte) ([]byte, error) {
\tensureSeedProfile()
\targs, err := decodeArgs(payload)
\tif err != nil {
\t\treturn nil, err
\t}
\tlimit := intArg(args, "limit", 50)
\tif limit <= 0 || limit > 500 {
\t\tlimit = 50
\t}
\tfacts, err := loadPublicFacts(limit)
\tif err != nil {
\t\treturn nil, err
\t}
\treturn mustJSON(map[string]any{"facts": facts, "total": len(facts)})
}

func handleUpsertPublicFact(_ *kotodama.AppContext, payload []byte) ([]byte, error) {
\tensureSeedProfile()
\targs, err := decodeArgs(payload)
\tif err != nil {
\t\treturn nil, err
\t}
\tkey := strings.TrimSpace(stringArg(args, "key"))
\tif key == "" {
\t\treturn nil, fmt.Errorf("key is required")
\t}
\tvalueJSON, err := json.Marshal(args["value"])
\tif err != nil {
\t\treturn nil, fmt.Errorf("marshal value: %w", err)
\t}
\tvisibility := strings.TrimSpace(stringArg(args, "visibility"))
\tif visibility == "" {
\t\tvisibility = "public"
\t}
\tsource := strings.TrimSpace(stringArg(args, "source"))
\tif source == "" {
\t\tsource = "manual"
\t}
\tif err := upsertPublicFact(key, string(valueJSON), visibility, source); err != nil {
\t\treturn nil, err
\t}
\treturn mustJSON(map[string]any{"status": "ok", "key": key, "visibility": visibility})
}

func handleListMessages(_ *kotodama.AppContext, payload []byte) ([]byte, error) {
\tensureSeedProfile()
\targs, err := decodeArgs(payload)
\tif err != nil {
\t\treturn nil, err
\t}
\tlimit := intArg(args, "limit", 50)
\tif limit <= 0 || limit > 500 {
\t\tlimit = 50
\t}
\tsessionID := strings.TrimSpace(stringArg(args, "session_id"))
\tmessages, err := loadMessages(sessionID, limit)
\tif err != nil {
\t\treturn nil, err
\t}
\treturn mustJSON(map[string]any{"messages": messages, "total": len(messages)})
}

func handleReceiveMessage(ctx *kotodama.AppContext, payload []byte) ([]byte, error) {
\tensureSeedProfile()
\targs, err := decodeArgs(payload)
\tif err != nil {
\t\treturn nil, err
\t}
\tcontent := strings.TrimSpace(stringArg(args, "content"))
\tif content == "" {
\t\tcontent = strings.TrimSpace(stringArg(args, "body"))
\t}
\tif content == "" {
\t\treturn nil, fmt.Errorf("content is required")
\t}
\tfromActorID := strings.TrimSpace(stringArg(args, "from"))
\tif fromActorID == "" {
\t\tfromActorID = strings.TrimSpace(stringArg(args, "from_actor_id"))
\t}
\trec := messageRecord{
\t\tMessageID:     messageID(stringArg(args, "message_id")),
\t\tSessionID:     strings.TrimSpace(stringArg(args, "session_id")),
\t\tDirection:     "inbound",
\t\tFromActorID:   fromActorID,
\t\tToActorID:     componentNanoID,
\t\tSubject:       strings.TrimSpace(stringArg(args, "subject")),
\t\tContent:       content,
\t\tVisibility:    visibilityArg(args),
\t\tCreatedAt:     nowRFC3339(),
\t\tOriginOrgID:   ctx.OrgID,
\t\tOriginUserID:  ctx.UserID,
\t\tOriginActorID: ctx.ActorID,
\t}
\tif err := storeMessage(rec); err != nil {
\t\treturn nil, err
\t}
\t_ = upsertPublicFact("last_message_at", mustJSONString(rec.CreatedAt), "public", "conversation")
\treturn mustJSON(map[string]any{"status": "received", "message_id": rec.MessageID})
}

func handleSendMessage(ctx *kotodama.AppContext, payload []byte) ([]byte, error) {
\tensureSeedProfile()
\targs, err := decodeArgs(payload)
\tif err != nil {
\t\treturn nil, err
\t}
\ttoActorID := strings.TrimSpace(stringArg(args, "to_actor_id"))
\tif toActorID == "" {
\t\ttoActorID = strings.TrimSpace(stringArg(args, "to_org_id"))
\t}
\tcontent := strings.TrimSpace(stringArg(args, "content"))
\tif content == "" {
\t\tcontent = strings.TrimSpace(stringArg(args, "body"))
\t}
\tsessionID := strings.TrimSpace(stringArg(args, "session_id"))
\tif content == "" {
\t\treturn nil, fmt.Errorf("content is required")
\t}
\tif sessionID == "" {
\t\tif toActorID == "" {
\t\t\treturn nil, fmt.Errorf("to_actor_id is required when session_id is empty")
\t\t}
\t\ttopic := strings.TrimSpace(stringArg(args, "topic"))
\t\tif topic == "" {
\t\t\ttopic = componentName + " outbound"
\t\t}
\t\tsession, err := kotodama.StartConversation(topic, []string{toActorID})
\t\tif err != nil {
\t\t\treturn nil, err
\t\t}
\t\tsessionID = session.SessionID
\t}
\tsent, err := kotodama.Say(sessionID, content)
\tif err != nil {
\t\treturn nil, err
\t}
\trec := messageRecord{
\t\tMessageID:      sent.MessageID,
\t\tSessionID:      sent.SessionID,
\t\tDirection:      "outbound",
\t\tFromActorID:    componentNanoID,
\t\tToActorID:      toActorID,
\t\tSubject:        strings.TrimSpace(stringArg(args, "subject")),
\t\tContent:        content,
\t\tVisibility:     visibilityArg(args),
\t\tCreatedAt:      sent.CreatedAt,
\t\tOriginOrgID:    ctx.OrgID,
\t\tOriginUserID:   ctx.UserID,
\t\tOriginActorID:  ctx.ActorID,
\t}
\tif err := storeMessage(rec); err != nil {
\t\treturn nil, err
\t}
\treturn mustJSON(map[string]any{
\t\t"status":      "sent",
\t\t"message_id":  sent.MessageID,
\t\t"session_id":  sent.SessionID,
\t\t"to_actor_id": toActorID,
\t})
}

func handleStartConversation(ctx *kotodama.AppContext, payload []byte) ([]byte, error) {
\tensureSeedProfile()
\targs, err := decodeArgs(payload)
\tif err != nil {
\t\treturn nil, err
\t}
\tparticipants := stringListArg(args, "participants")
\tif len(participants) == 0 {
\t\treturn nil, fmt.Errorf("participants is required")
\t}
\ttopic := strings.TrimSpace(stringArg(args, "topic"))
\tif topic == "" {
\t\ttopic = componentName + " conversation"
\t}
\tsession, err := kotodama.StartConversation(topic, participants)
\tif err != nil {
\t\treturn nil, err
\t}
\topening := strings.TrimSpace(stringArg(args, "opening_content"))
\tif opening != "" {
\t\tsent, err := kotodama.Say(session.SessionID, opening)
\t\tif err != nil {
\t\t\treturn nil, err
\t\t}
\t\t_ = storeMessage(messageRecord{
\t\t\tMessageID:      sent.MessageID,
\t\t\tSessionID:      sent.SessionID,
\t\t\tDirection:      "outbound",
\t\t\tFromActorID:    componentNanoID,
\t\t\tContent:        opening,
\t\t\tVisibility:     visibilityArg(args),
\t\t\tCreatedAt:      sent.CreatedAt,
\t\t\tOriginOrgID:    ctx.OrgID,
\t\t\tOriginUserID:   ctx.UserID,
\t\t\tOriginActorID:  ctx.ActorID,
\t\t})
\t}
\treturn mustJSON(map[string]any{
\t\t"status":       "started",
\t\t"session_id":   session.SessionID,
\t\t"topic":        session.Topic,
\t\t"participants": participants,
\t})
}

func handleConversationMessage(ctx *kotodama.AppContext, msg kotodama.ConversationMessage) error {
\tensureSeedProfile()
\tinbound := messageRecord{
\t\tMessageID:      msg.MessageID,
\t\tSessionID:      msg.SessionID,
\t\tDirection:      "inbound",
\t\tFromActorID:    msg.From,
\t\tToActorID:      componentNanoID,
\t\tContent:        strings.TrimSpace(msg.Content),
\t\tVisibility:     "public",
\t\tCreatedAt:      msg.CreatedAt,
\t\tOriginOrgID:    ctx.OrgID,
\t\tOriginUserID:   ctx.UserID,
\t\tOriginActorID:  ctx.ActorID,
\t}
\tif err := storeMessage(inbound); err != nil {
\t\treturn err
\t}
\t_ = upsertPublicFact("last_conversation_at", mustJSONString(msg.CreatedAt), "public", "conversation")
\treply, err := generateConversationReply(msg)
\tif err != nil {
\t\treturn err
\t}
\tif reply == "" {
\t\treturn nil
\t}
\tvar sent *kotodama.ConversationMessage
\tif msg.MessageID != "" {
\t\tsent, err = kotodama.Reply(msg.SessionID, reply, msg.MessageID)
\t} else {
\t\tsent, err = kotodama.Say(msg.SessionID, reply)
\t}
\tif err != nil {
\t\treturn err
\t}
\treturn storeMessage(messageRecord{
\t\tMessageID:      sent.MessageID,
\t\tSessionID:      sent.SessionID,
\t\tDirection:      "outbound",
\t\tFromActorID:    componentNanoID,
\t\tToActorID:      msg.From,
\t\tContent:        reply,
\t\tVisibility:     "public",
\t\tCreatedAt:      sent.CreatedAt,
\t\tOriginOrgID:    ctx.OrgID,
\t\tOriginUserID:   ctx.UserID,
\t\tOriginActorID:  ctx.ActorID,
\t})
}

func generateConversationReply(msg kotodama.ConversationMessage) (string, error) {
\tfacts, _ := loadPublicFacts(8)
\tmessages := []kotodama.Message{
\t\t{Role: kotodama.RoleSystem, Content: buildConversationSystemPrompt(facts)},
\t\t{Role: kotodama.RoleUser, Content: strings.TrimSpace(msg.Content)},
\t}
\topts := kotodama.ChatOptions{ScrubPII: true}
\tif msg.SessionID != "" {
\t\topts.ContextID = &msg.SessionID
\t}
\tif model := strings.TrimSpace(${toGoString(slot.status === 'implemented' ? 'openrouter/auto' : '')}); model != "" {
\t\topts.Model = &model
\t}
\tresp, errMsg := kotodama.AgentConverse(messages, opts)
\tif errMsg != "" {
\t\treturn "", fmt.Errorf("conversation agent: %s", errMsg)
\t}
\treturn strings.TrimSpace(resp.Content), nil
}

func buildConversationSystemPrompt(facts []publicFact) string {
\tbase := ${toGoString(buildSystemPrompt(slot))}
\tif len(facts) == 0 {
\t\treturn base + " Keep a public log of conversations and expose your profile when asked."
\t}
\tparts := make([]string, 0, len(facts))
\tfor _, fact := range facts {
\t\tparts = append(parts, fact.Key+"="+fact.ValueJSON)
\t}
\treturn base + " Keep a public log of conversations and expose your profile when asked. Published facts: " + strings.Join(parts, "; ")
}

func ensureSeedProfile() {
\tnow := nowRFC3339()
\t_ = kotodama.SqlExec(
\t\t"MERGE (n:PublicCompanyActorProfile {'app_id': $app_id}) SET n.component_nanoid = $component_nanoid, n.component_name = $component_name, n.description = $description, n.section = $section, n.section_name = $section_name, n.rank = $rank, n.status = $status, n.coverage_target = $coverage_target, n.market_cap_usd = $market_cap_usd, n.ticker = $ticker, n.company_name = $company_name, n.exchange_mic = $exchange_mic, n.isic_code = $isic_code, n.sector = $sector, n.industry = $industry, n.source_path = $source_path, n.protocol = 'wproto', n.updated_at = $updated_at, n.created_at = coalesce(n.created_at, $created_at), n.org_id = 'public', n.user_id = 'public', n.actor_id = ''",
\t\tmap[string]any{
\t\t\t"app_id":          componentNanoID,
\t\t\t"component_nanoid": componentNanoID,
\t\t\t"component_name":  componentName,
\t\t\t"description":     serviceDesc,
\t\t\t"section":         seedSlot.Section,
\t\t\t"section_name":    seedSlot.SectionName,
\t\t\t"rank":            seedSlot.Rank,
\t\t\t"status":          seedSlot.Status,
\t\t\t"coverage_target": seedSlot.CoverageTarget,
\t\t\t"market_cap_usd":  seedSlot.MarketCapUSD,
\t\t\t"ticker":          seedSlot.Ticker,
\t\t\t"company_name":    seedSlot.CompanyName,
\t\t\t"exchange_mic":    seedSlot.ExchangeMIC,
\t\t\t"isic_code":       seedSlot.ISICCode,
\t\t\t"sector":          seedSlot.Sector,
\t\t\t"industry":        seedSlot.Industry,
\t\t\t"source_path":     seedSlot.SourcePath,
\t\t\t"updated_at":      now,
\t\t\t"created_at":      now,
\t\t},
\t)
}

func upsertPublicFact(key, valueJSON, visibility, source string) error {
\treturn kotodama.SqlExec(
\t\t"MERGE (n:PublicCompanyActorFact {'app_id': $app_id, key: $key}) SET n.value_json = $value_json, n.visibility = $visibility, n.source = $source, n.updated_at = $updated_at, n.created_at = coalesce(n.created_at, $created_at), n.org_id = 'public', n.user_id = 'public', n.actor_id = ''",
\t\tmap[string]any{
\t\t\t"app_id":     componentNanoID,
\t\t\t"key":        key,
\t\t\t"value_json": valueJSON,
\t\t\t"visibility": visibility,
\t\t\t"source":     source,
\t\t\t"updated_at": nowRFC3339(),
\t\t\t"created_at": nowRFC3339(),
\t\t},
\t)
}

func loadPublicFacts(limit int) ([]publicFact, error) {
\trows, err := kotodama.SqlQueryMap(
\t\tfmt.Sprintf("MATCH (n:PublicCompanyActorFact {'app_id': $app_id}) RETURN n.key AS key, n.value_json AS value_json, n.visibility AS visibility, n.source AS source, n.updated_at AS updated_at ORDER BY n.updated_at DESC LIMIT %d", limit),
\t\tmap[string]any{"app_id": componentNanoID},
\t)
\tif err != nil {
\t\treturn nil, err
\t}
\tout := make([]publicFact, 0, len(rows))
\tfor _, row := range rows {
\t\tout = append(out, publicFact{
\t\t\tKey:        stringFromRow(row, "key"),
\t\t\tValueJSON:  stringFromRow(row, "value_json"),
\t\t\tVisibility: stringFromRow(row, "visibility"),
\t\t\tSource:     stringFromRow(row, "source"),
\t\t\tUpdatedAt:  stringFromRow(row, "updated_at"),
\t\t})
\t}
\treturn out, nil
}

func storeMessage(rec messageRecord) error {
\treturn kotodama.SqlExec(
\t\t"MERGE (n:PublicCompanyActorMessage {'app_id': $app_id, 'message_id': $message_id}) SET n.session_id = $session_id, n.direction = $direction, n.from_actor_id = $from_actor_id, n.to_actor_id = $to_actor_id, n.subject = $subject, n.content = $content, n.visibility = $visibility, n.created_at = $created_at, n.origin_org_id = $origin_org_id, n.origin_user_id = $origin_user_id, n.origin_actor_id = $origin_actor_id, n.org_id = 'public', n.user_id = 'public', n.actor_id = ''",
\t\tmap[string]any{
\t\t\t"app_id":          componentNanoID,
\t\t\t"message_id":      rec.MessageID,
\t\t\t"session_id":      rec.SessionID,
\t\t\t"direction":       rec.Direction,
\t\t\t"from_actor_id":   rec.FromActorID,
\t\t\t"to_actor_id":     rec.ToActorID,
\t\t\t"subject":         rec.Subject,
\t\t\t"content":         rec.Content,
\t\t\t"visibility":      rec.Visibility,
\t\t\t"created_at":      rec.CreatedAt,
\t\t\t"origin_org_id":   rec.OriginOrgID,
\t\t\t"origin_user_id":  rec.OriginUserID,
\t\t\t"origin_actor_id": rec.OriginActorID,
\t\t},
\t)
}

func loadMessages(sessionID string, limit int) ([]messageRecord, error) {
\tquery := fmt.Sprintf("MATCH (n:PublicCompanyActorMessage {'app_id': $app_id}) %%s RETURN n.message_id AS message_id, n.session_id AS session_id, n.direction AS direction, n.from_actor_id AS from_actor_id, n.to_actor_id AS to_actor_id, n.subject AS subject, n.content AS content, n.visibility AS visibility, n.created_at AS created_at, n.origin_org_id AS origin_org_id, n.origin_user_id AS origin_user_id, n.origin_actor_id AS origin_actor_id ORDER BY n.created_at DESC LIMIT %d", limit)
\tparams := map[string]any{"app_id": componentNanoID}
\twhere := ""
\tif sessionID != "" {
\t\twhere = "WHERE n.session_id = $session_id"
\t\tparams["session_id"] = sessionID
\t}
\trows, err := kotodama.SqlQueryMap(fmt.Sprintf(query, where), params)
\tif err != nil {
\t\treturn nil, err
\t}
\tout := make([]messageRecord, 0, len(rows))
\tfor _, row := range rows {
\t\tout = append(out, messageRecord{
\t\t\tMessageID:     stringFromRow(row, "message_id"),
\t\t\tSessionID:     stringFromRow(row, "session_id"),
\t\t\tDirection:     stringFromRow(row, "direction"),
\t\t\tFromActorID:   stringFromRow(row, "from_actor_id"),
\t\t\tToActorID:     stringFromRow(row, "to_actor_id"),
\t\t\tSubject:       stringFromRow(row, "subject"),
\t\t\tContent:       stringFromRow(row, "content"),
\t\t\tVisibility:    stringFromRow(row, "visibility"),
\t\t\tCreatedAt:     stringFromRow(row, "created_at"),
\t\t\tOriginOrgID:   stringFromRow(row, "origin_org_id"),
\t\t\tOriginUserID:  stringFromRow(row, "origin_user_id"),
\t\t\tOriginActorID: stringFromRow(row, "origin_actor_id"),
\t\t})
\t}
\treturn out, nil
}

func countMessages() (int, error) {
\trows, err := kotodama.SqlQueryMap(
\t\t"MATCH (n:PublicCompanyActorMessage {'app_id': $app_id}) RETURN count(n) AS cnt",
\t\tmap[string]any{"app_id": componentNanoID},
\t)
\tif err != nil {
\t\treturn 0, err
\t}
\tif len(rows) == 0 {
\t\treturn 0, nil
\t}
\treturn int(numberFromRow(rows[0], "cnt")), nil
}

func decodeArgs(payload []byte) (map[string]any, error) {
\tif len(payload) == 0 {
\t\treturn map[string]any{}, nil
\t}
\ttrimmed := strings.TrimSpace(string(payload))
\tif trimmed == "" || trimmed == "null" {
\t\treturn map[string]any{}, nil
\t}
\tvar out map[string]any
\tif err := json.Unmarshal([]byte(trimmed), &out); err != nil {
\t\treturn nil, err
\t}
\tif out == nil {
\t\tout = map[string]any{}
\t}
\treturn out, nil
}

func stringArg(args map[string]any, key string) string {
\tv, ok := args[key]
\tif !ok || v == nil {
\t\treturn ""
\t}
\ts, ok := v.(string)
\tif ok {
\t\treturn s
\t}
\tb, _ := json.Marshal(v)
\treturn string(b)
}

func stringListArg(args map[string]any, key string) []string {
\traw, ok := args[key]
\tif !ok || raw == nil {
\t\treturn nil
\t}
\titems, ok := raw.([]any)
\tif !ok {
\t\treturn nil
\t}
\tout := make([]string, 0, len(items))
\tfor _, item := range items {
\t\ts, ok := item.(string)
\t\tif ok && strings.TrimSpace(s) != "" {
\t\t\tout = append(out, strings.TrimSpace(s))
\t\t}
\t}
\treturn out
}

func intArg(args map[string]any, key string, defaultVal int) int {
\tv, ok := args[key]
\tif !ok || v == nil {
\t\treturn defaultVal
\t}
\tswitch n := v.(type) {
\tcase float64:
\t\treturn int(n)
\tcase int:
\t\treturn n
\tdefault:
\t\treturn defaultVal
\t}
}

func visibilityArg(args map[string]any) string {
\tvisibility := strings.TrimSpace(stringArg(args, "visibility"))
\tif visibility == "" {
\t\treturn "public"
\t}
\treturn visibility
}

func stringFromRow(row map[string]any, key string) string {
\tv, ok := row[key]
\tif !ok || v == nil {
\t\treturn ""
\t}
\ts, ok := v.(string)
\tif ok {
\t\treturn s
\t}
\tb, _ := json.Marshal(v)
\treturn string(b)
}

func numberFromRow(row map[string]any, key string) float64 {
\tv, ok := row[key]
\tif !ok || v == nil {
\t\treturn 0
\t}
\tswitch n := v.(type) {
\tcase float64:
\t\treturn n
\tcase int:
\t\treturn float64(n)
\tcase int64:
\t\treturn float64(n)
\tdefault:
\t\treturn 0
\t}
}

func messageID(prefix string) string {
\tif strings.TrimSpace(prefix) == "" {
\t\tprefix = "msg"
\t}
\tnow := time.Now().UTC()
\treturn fmt.Sprintf("%s-%d%09d", prefix, now.Unix(), now.Nanosecond())
}

func nowRFC3339() string {
\treturn time.Now().UTC().Format(time.RFC3339)
}

func mustJSONString(v any) string {
\tb, _ := json.Marshal(v)
\treturn string(b)
}

func mustJSON(v any) ([]byte, error) {
\treturn json.Marshal(v)
}

var _ = json.Number("")
`
}

function goMod(section, rank) {
  return `module ${goModuleName(section, rank)}

go 1.23.0

toolchain go1.23.6

require github.com/etzhayyim/root/40-engine/kotoba/crates/kotoba-kotodama-go v0.0.0

replace github.com/etzhayyim/root/40-engine/kotoba/crates/kotoba-kotodama-go => ../../../../packages/rust/kotodama/kotodama-go
`;
}

function kotodamaToml() {
  return `# generated market-cap slot app

[component]
path = "/legacy/component.bin"

[ui]
mode = "canvas"
accent = "#0f766e"
icon = "🏢"

[component.env]

[triggers.http]
listen = "0.0.0.0:8080"
routes = ["/api/...", "/health", "/healthz", "/readyz", "/.well-known/did.json", "/.well-known/atproto-did"]

[yata]
data_dir = "/data/yata"

[pool]
size = 1
`;
}

async function main() {
  const report = JSON.parse(await fs.readFile(sourceReportPath, 'utf8'));
  const sections = new Map(report.sections.map((section) => [section.section, section]));
  const manifest = [];

  for (const section of sectionOrder) {
    const sectionReport = sections.get(section) ?? { section, sectionName: '', entries: [] };
    for (let rank = 1; rank <= 10; rank += 1) {
      const entry = sectionReport.entries[rank - 1] ?? null;
      const slot = {
        section,
        sectionName: sectionReport.sectionName || '',
        rank,
        nanoid: appNanoid(section, rank),
        dirName: dirName(section, rank),
        appName: `Public Company ISIC ${section} Top ${pad2(rank)}`,
        description: entry
          ? `Kotodama app for ISIC ${section} rank ${pad2(rank)} by market cap: ${entry.name}`
          : `Kotodama app placeholder for ISIC ${section} rank ${pad2(rank)} by market cap`,
        status: entry ? 'implemented' : 'planned',
        ticker: entry?.ticker ?? null,
        companyName: entry?.name ?? null,
        exchangeMic: entry?.exchangeMic ?? null,
        isicCode: entry?.isicCode ?? null,
        marketCapUsd: entry?.marketCapUsd ?? 0,
        sector: entry?.sector ?? null,
        industry: entry?.industry ?? null,
        sourcePath: entry?.sourcePath ?? null,
      };

      const outDir = path.join(legacyActorRoot, slot.dirName);
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, 'main.go'), mainGo(slot), 'utf8');
      await fs.writeFile(path.join(outDir, 'go.mod'), goMod(section, rank), 'utf8');
      await fs.writeFile(path.join(outDir, 'kotodama.toml'), kotodamaToml(), 'utf8');
      await fs.rm(path.join(outDir, 'spin.toml'), { force: true });

      manifest.push({
        section: slot.section,
        rank: slot.rank,
        nanoid: slot.nanoid,
        dirName: slot.dirName,
        status: slot.status,
        ticker: slot.ticker,
        companyName: slot.companyName,
        exchangeMic: slot.exchangeMic,
        marketCapUsd: slot.marketCapUsd,
      });
    }
  }

  await fs.writeFile(manifestPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalApps: manifest.length,
    apps: manifest,
  }, null, 2)}\n`, 'utf8');

  process.stdout.write(`Generated ${manifest.length} slot apps\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
