// The 409 body for any write about an Archived Patient. The screen switches on `code`.
export const PATIENT_ARCHIVED = {
    error: 'This Patient is Archived. Restore them to make changes.',
    code: 'patient_archived',
} as const;
