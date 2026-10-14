-- Preserve existing grade IDs and all class/curriculum references.
INSERT INTO grades (school_id, number)
SELECT s.id, n FROM schools s CROSS JOIN generate_series(8, 12) n
ON CONFLICT (school_id, number) DO NOTHING;
--> statement-breakpoint
ALTER TABLE grades ADD CONSTRAINT grades_supported_number CHECK (number BETWEEN 8 AND 12);
--> statement-breakpoint
CREATE FUNCTION provision_school_grades() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO grades (school_id, number) SELECT NEW.id, n FROM generate_series(8, 12) n;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER schools_provision_grades AFTER INSERT ON schools
FOR EACH ROW EXECUTE FUNCTION provision_school_grades();
--> statement-breakpoint
CREATE FUNCTION protect_school_grades() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'School grades are fixed and cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW.number IS DISTINCT FROM OLD.number OR NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'School grades cannot be renumbered or moved' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER grades_protect_fixed_set BEFORE DELETE OR UPDATE ON grades
FOR EACH ROW EXECUTE FUNCTION protect_school_grades();
