import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Better Auth's tables live in their own generated file; re-exported so drizzle-kit and
// getDb() see one schema.
export * from './auth-schema';

// The patients table, written in TypeScript. Drizzle uses this one definition twice:
//   1. drizzle-kit reads it to generate the CREATE TABLE migration (drizzle/*.sql)
//   2. your queries use it, so TypeScript knows every column and its type
// Later slices add columns (guardian, created_by, ...) with their own migrations.
export const patients = sqliteTable('patients', {
    // Random UUID instead of 1, 2, 3...: patient ids appear in URLs and shouldn't be guessable.
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    fullName: text('full_name').notNull(),
    mobilePhone: text('mobile_phone'),
    // Search columns, rewritten on every write by worker/patients/normalize.ts. Search and
    // the duplicate check match against these, never against the display columns above.
    nameSearch: text('name_search').notNull().default(''), // lowercased, accents removed
    phoneSearch: text('phone_search'), // last 10 digits, so 0917..., 917... and +63917... agree
    // Nullable: quick add saves a patient before the Intake form fills this in.
    birthdate: text('birthdate'), // 'YYYY-MM-DD'
    // Filled in by the Intake.
    previousSurname: text('previous_surname'),
    previousSurnameSearch: text('previous_surname_search'), // normalised like name_search
    sex: text('sex', { enum: ['female', 'male'] }),
    occupation: text('occupation'),
    landline: text('landline'),
    email: text('email'),
    address: text('address'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    patientHistory: text('patient_history'),
    // Set only for a Patient under 18. Siblings point at the same guardians row.
    guardianId: text('guardian_id'),
    // Clinic-local date ('YYYY-MM-DD') the Patient or Guardian gave consent at Intake.
    consentGivenOn: text('consent_given_on'),
    // null = Pending Intake (see CONTEXT.md).
    intakeCompletedAt: integer('intake_completed_at', { mode: 'timestamp_ms' }),
    // null = active, set = Archived. Nothing is ever deleted.
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    // Audit: the User who created / last changed the row (user.id). Nullable because rows from
    // before sign-in existed have no author. No foreign key, so the audit trail survives
    // even if a User row is ever removed. Fill them with auditOnCreate / auditOnUpdate.
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
});

// One row per Appointment. Quick add can create the first one; the Appointments slice owns the rest.
export const appointments = sqliteTable(
    'appointments',
    {
        id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
        patientId: text('patient_id').notNull(),
        // A UTC instant (epoch ms). The clinic's wall-clock time is derived in Asia/Manila.
        startAt: integer('start_at', { mode: 'timestamp_ms' }).notNull(),
        durationMinutes: integer('duration_minutes').notNull().default(30),
        reason: text('reason'),
        status: text('status', { enum: ['scheduled', 'completed', 'cancelled', 'no_show'] })
            .notNull()
            .default('scheduled'),
        walkIn: integer('walk_in', { mode: 'boolean' }).notNull().default(false),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
        createdBy: text('created_by'),
        updatedBy: text('updated_by'),
    },
    (t) => [index('appointments_patient_start_idx').on(t.patientId, t.startAt)],
);

// Backs the recently seen list: the last time each User opened each Patient Record.
export const patientViews = sqliteTable(
    'patient_views',
    {
        userId: text('user_id').notNull(),
        patientId: text('patient_id').notNull(),
        lastViewedAt: integer('last_viewed_at', { mode: 'timestamp_ms' }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.userId, t.patientId] })],
);

// The adult responsible for a Patient under 18. Several Patients can point at one row.
export const guardians = sqliteTable('guardians', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    relationship: text('relationship').notNull(),
    phone: text('phone').notNull(),
    phoneSearch: text('phone_search').notNull(), // last 10 digits, like patients.phone_search
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
});

// One per Patient (patient_id is the key). Ticked lists are JSON arrays of keys from worker/intake/lists.ts.
export const medicalHistories = sqliteTable('medical_histories', {
    patientId: text('patient_id').primaryKey(),
    seriousIllness: integer('serious_illness', { mode: 'boolean' }).notNull(),
    seriousIllnessDetails: text('serious_illness_details'),
    bloodTransfusion: integer('blood_transfusion', { mode: 'boolean' }).notNull(),
    transfusionDates: text('transfusion_dates'),
    // Only for female Patients; null otherwise.
    pregnant: integer('pregnant', { mode: 'boolean' }),
    nursing: integer('nursing', { mode: 'boolean' }),
    birthControl: integer('birth_control', { mode: 'boolean' }),
    conditions: text('conditions', { mode: 'json' }).$type<string[]>().notNull(),
    medications: text('medications'),
    allergies: text('allergies', { mode: 'json' }).$type<string[]>().notNull(),
    allergiesOther: text('allergies_other'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
});

export const dentalHistories = sqliteTable('dental_histories', {
    patientId: text('patient_id').primaryKey(),
    visitReason: text('visit_reason').notNull(),
    formerDentistName: text('former_dentist_name'),
    formerDentistContact: text('former_dentist_contact'),
    formerDentistAddress: text('former_dentist_address'),
    lastDentalCare: text('last_dental_care'), // 'YYYY-MM-DD'
    symptoms: text('symptoms', { mode: 'json' }).$type<string[]>().notNull(),
    brushFrequency: text('brush_frequency').notNull(),
    flossFrequency: text('floss_frequency').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
});

// At most one per Appointment (the unique index). Whether it is Locked is never stored: it is worked
// out from written_at and today's clinic date (worker/notes/rules.ts).
export const treatmentNotes = sqliteTable(
    'treatment_notes',
    {
        id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
        appointmentId: text('appointment_id').notNull(),
        findings: text('findings').notNull(),
        treatmentDone: text('treatment_done').notNull(),
        nextSteps: text('next_steps'),
        writtenBy: text('written_by').notNull(), // user.id
        writtenAt: integer('written_at', { mode: 'timestamp_ms' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
        updatedBy: text('updated_by'),
    },
    (t) => [uniqueIndex('treatment_notes_appointment_uidx').on(t.appointmentId)],
);

// Added to a Locked note, never changed or removed (no route updates this table).
export const amendments = sqliteTable(
    'amendments',
    {
        id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
        treatmentNoteId: text('treatment_note_id').notNull(),
        text: text('text').notNull(),
        writtenBy: text('written_by').notNull(), // user.id
        writtenAt: integer('written_at', { mode: 'timestamp_ms' }).notNull(),
    },
    (t) => [index('amendments_note_idx').on(t.treatmentNoteId, t.writtenAt)],
);
