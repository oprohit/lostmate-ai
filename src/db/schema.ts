import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "staff", "admin"]);
export const reportTypeEnum = pgEnum("report_type", ["lost", "found"]);
export const reportStatusEnum = pgEnum("report_status", ["open", "matched", "claimed", "closed"]);
export const matchStatusEnum = pgEnum("match_status", ["suggested", "accepted", "rejected"]);
export const claimStatusEnum = pgEnum("claim_status", ["pending", "approved", "completed", "rejected"]);
export const staffActionTypeEnum = pgEnum("staff_action_type", [
  "reviewed_match",
  "updated_report",
  "created_claim",
  "completed_claim",
  "rejected_claim",
]);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").default("user").notNull(),
    avatarColor: text("avatar_color").default("#9D8BFF").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("profiles_email_unique").on(table.email), index("profiles_role_idx").on(table.role)],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: reportTypeEnum("type").notNull(),
    status: reportStatusEnum("status").default("open").notNull(),
    itemType: text("item_type").notNull(),
    category: text("category").notNull(),
    brand: text("brand"),
    color: text("color"),
    description: text("description").notNull(),
    distinguishingFeatures: text("distinguishing_features"),
    location: text("location").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    holdingLocation: text("holding_location"),
    imageUrl: text("image_url"),
    sourceText: text("source_text"),
    aiExtracted: boolean("ai_extracted").default(false).notNull(),
    aiMetadata: jsonb("ai_metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("reports_type_status_idx").on(table.type, table.status),
    index("reports_category_idx").on(table.category),
    index("reports_location_idx").on(table.location),
    index("reports_created_at_idx").on(table.createdAt),
    index("reports_reporter_idx").on(table.reporterId),
  ],
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lostReportId: uuid("lost_report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    foundReportId: uuid("found_report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    confidence: real("confidence").notNull(),
    explanation: text("explanation").notNull(),
    signals: jsonb("signals"),
    status: matchStatusEnum("status").default("suggested").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => profiles.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("matches_report_pair_unique").on(table.lostReportId, table.foundReportId),
    index("matches_status_confidence_idx").on(table.status, table.confidence),
    index("matches_lost_report_idx").on(table.lostReportId),
    index("matches_found_report_idx").on(table.foundReportId),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    claimantId: uuid("claimant_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: claimStatusEnum("status").default("pending").notNull(),
    notes: text("notes"),
    handoverLocation: text("handover_location"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("claims_status_idx").on(table.status),
    index("claims_report_idx").on(table.reportId),
    index("claims_claimant_idx").on(table.claimantId),
  ],
);

export const staffActions = pgTable(
  "staff_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    reportId: uuid("report_id").references(() => reports.id, { onDelete: "set null" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    claimId: uuid("claim_id").references(() => claims.id, { onDelete: "set null" }),
    action: staffActionTypeEnum("action").notNull(),
    note: text("note"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("staff_actions_created_at_idx").on(table.createdAt), index("staff_actions_staff_idx").on(table.staffId)],
);

export type Profile = typeof profiles.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type StaffAction = typeof staffActions.$inferSelect;
