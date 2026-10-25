import { eq } from 'drizzle-orm';
import type { getDb } from '../db/client';
import { guardians, medicalHistories, patients } from '../db/schema';
import { medicalAlerts } from './alerts';

type Db = ReturnType<typeof getDb>;
type PatientRow = typeof patients.$inferSelect;

// What the Patient Record shows beyond the header: personal details, consent date, the Guardian and
// the Medical History alerts. All empty for a Pending Intake Patient.
export async function intakeSummary(db: Db, patient: PatientRow) {
    const [history] = await db.select().from(medicalHistories).where(eq(medicalHistories.patientId, patient.id));
    const [guardian] = patient.guardianId
        ? await db.select().from(guardians).where(eq(guardians.id, patient.guardianId))
        : [];
    return {
        alerts: history ? medicalAlerts(history) : [],
        details: {
            previousSurname: patient.previousSurname,
            sex: patient.sex,
            occupation: patient.occupation,
            landline: patient.landline,
            email: patient.email,
            address: patient.address,
            emergencyContactName: patient.emergencyContactName,
            emergencyContactPhone: patient.emergencyContactPhone,
            patientHistory: patient.patientHistory,
        },
        consentGivenOn: patient.consentGivenOn,
        guardian: guardian
            ? { id: guardian.id, name: guardian.name, relationship: guardian.relationship, phone: guardian.phone }
            : null,
    };
}
