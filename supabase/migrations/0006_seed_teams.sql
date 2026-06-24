-- =============================================================================
-- FIFA Fantasy Predictor — Seed: 48 World Cup 2026 Nations
-- =============================================================================
-- Source: official FIFA World Cup 2026 Squad List (Version 1, 13 June 2026),
-- 48 confirmed qualified nations. Re-running this is safe — existing rows
-- (matched by unique team name) are left untouched.
-- =============================================================================

insert into public.teams (name, fifa_code, flag_emoji)
values
  ('Algeria', 'ALG', '🇩🇿'),
  ('Argentina', 'ARG', '🇦🇷'),
  ('Australia', 'AUS', '🇦🇺'),
  ('Austria', 'AUT', '🇦🇹'),
  ('Belgium', 'BEL', '🇧🇪'),
  ('Bosnia And Herzegovina', 'BIH', '🇧🇦'),
  ('Brazil', 'BRA', '🇧🇷'),
  ('Cabo Verde', 'CPV', '🇨🇻'),
  ('Canada', 'CAN', '🇨🇦'),
  ('Colombia', 'COL', '🇨🇴'),
  ('Congo DR', 'COD', '🇨🇩'),
  ('Croatia', 'CRO', '🇭🇷'),
  ('Curaçao', 'CUW', '🇨🇼'),
  ('Czechia', 'CZE', '🇨🇿'),
  ('Côte D''Ivoire', 'CIV', '🇨🇮'),
  ('Ecuador', 'ECU', '🇪🇨'),
  ('Egypt', 'EGY', '🇪🇬'),
  ('England', 'ENG', '🇬🇧'),
  ('France', 'FRA', '🇫🇷'),
  ('Germany', 'GER', '🇩🇪'),
  ('Ghana', 'GHA', '🇬🇭'),
  ('Haiti', 'HAI', '🇭🇹'),
  ('IR Iran', 'IRN', '🇮🇷'),
  ('Iraq', 'IRQ', '🇮🇶'),
  ('Japan', 'JPN', '🇯🇵'),
  ('Jordan', 'JOR', '🇯🇴'),
  ('Korea Republic', 'KOR', '🇰🇷'),
  ('Mexico', 'MEX', '🇲🇽'),
  ('Morocco', 'MAR', '🇲🇦'),
  ('Netherlands', 'NED', '🇳🇱'),
  ('New Zealand', 'NZL', '🇳🇿'),
  ('Norway', 'NOR', '🇳🇴'),
  ('Panama', 'PAN', '🇵🇦'),
  ('Paraguay', 'PAR', '🇵🇾'),
  ('Portugal', 'POR', '🇵🇹'),
  ('Qatar', 'QAT', '🇶🇦'),
  ('Saudi Arabia', 'KSA', '🇸🇦'),
  ('Scotland', 'SCO', '🇬🇧'),
  ('Senegal', 'SEN', '🇸🇳'),
  ('South Africa', 'RSA', '🇿🇦'),
  ('Spain', 'ESP', '🇪🇸'),
  ('Sweden', 'SWE', '🇸🇪'),
  ('Switzerland', 'SUI', '🇨🇭'),
  ('Tunisia', 'TUN', '🇹🇳'),
  ('Türkiye', 'TUR', '🇹🇷'),
  ('USA', 'USA', '🇺🇸'),
  ('Uruguay', 'URU', '🇺🇾'),
  ('Uzbekistan', 'UZB', '🇺🇿')
on conflict (name) do update set
  fifa_code = excluded.fifa_code,
  flag_emoji = excluded.flag_emoji;
