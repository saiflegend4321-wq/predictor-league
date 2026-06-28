/**
 * Short label for buttons and compact UI.
 * Real nations use fifa_code (e.g. "BRA"); knockout placeholders
 * from openfootball (e.g. "2A", "W74") only have name.
 */
export function teamShortLabel(team) {
  return team?.fifa_code ?? team?.name ?? "TBD";
}
