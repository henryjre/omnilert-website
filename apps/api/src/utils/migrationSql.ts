export function buildAddCheckConstraintIfMissingSql(
  tableName: string,
  constraintName: string,
  checkExpression: string,
): string {
  return `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '${constraintName}'
          AND conrelid = '${tableName}'::regclass
      ) THEN
        ALTER TABLE ${tableName}
        ADD CONSTRAINT ${constraintName}
        CHECK (${checkExpression});
      END IF;
    END;
    $$;
  `;
}
