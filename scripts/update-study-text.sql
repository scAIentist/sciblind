-- Update IzVRS Study Title and Description
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/rdsozrebfjjoknqonvbk/sql

UPDATE "Study"
SET
  title = 'IzVRS Likovni natečaj 2025',
  description = 'Slepo primerjanje likovnih del učencev za izbor najboljših 12, ki bodo natisnjeni na sledilnikih. Pomagajte nam pri izboru!'
WHERE id = 'cml808mzc0000m104un333c69';

-- Verify the update
SELECT id, title, description FROM "Study" WHERE id = 'cml808mzc0000m104un333c69';
