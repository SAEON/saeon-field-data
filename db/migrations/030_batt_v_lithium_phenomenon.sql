-- Migration 030: Add CR1000 internal lithium battery phenomenon.
-- LoggerLithiumBatt_Avg appears in Mokala AWS and Mabasa TC Table* files
-- and was previously silently dropped by the TOA5 parser.

INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type)
VALUES ('batt_v_lithium', 'Logger Lithium Battery', 'met', 'V', 'average', 'numeric')
ON CONFLICT (name) DO NOTHING;
