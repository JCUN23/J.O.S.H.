// Followed teams: the single source of truth for Game Day (was copy-pasted in the
// Sports widget, Sentinel's tool and the route). Schedules come from ESPN's public
// site API, same as the Sports widget.
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

const TEAMS = [
  { key: 'lions', name: 'Detroit Lions', abbr: 'DET', aliases: ['lions'],
    scheduleUrl: `${ESPN}/football/nfl/teams/8/schedule`,
    colors: { primary: { r: 0, g: 118, b: 182 }, secondary: { r: 176, g: 183, b: 188 }, name: 'Honolulu Blue & Silver' } },
  { key: 'michigan-football', name: 'Michigan Football', abbr: 'MICH', aliases: ['michigan football', 'wolverines football'],
    scheduleUrl: `${ESPN}/football/college-football/teams/130/schedule`,
    colors: { primary: { r: 255, g: 203, b: 5 }, secondary: { r: 0, g: 39, b: 76 }, name: 'Maize & Blue' } },
  { key: 'michigan-basketball', name: 'Michigan Basketball', abbr: 'MICH', aliases: ['michigan basketball', 'michigan'],
    scheduleUrl: `${ESPN}/basketball/mens-college-basketball/teams/130/schedule`,
    colors: { primary: { r: 255, g: 203, b: 5 }, secondary: { r: 0, g: 39, b: 76 }, name: 'Maize & Blue' } },
  { key: 'pistons', name: 'Detroit Pistons', abbr: 'DET', aliases: ['pistons'],
    scheduleUrl: `${ESPN}/basketball/nba/teams/8/schedule`,
    colors: { primary: { r: 200, g: 16, b: 46 }, secondary: { r: 29, g: 66, b: 186 }, name: 'Red & Blue' } },
  { key: 'barcelona', name: 'FC Barcelona', abbr: 'BAR', aliases: ['barcelona', 'barca', 'barça'],
    scheduleUrl: `${ESPN}/soccer/esp.1/teams/83/schedule`,
    colors: { primary: { r: 165, g: 0, b: 68 }, secondary: { r: 0, g: 77, b: 152 }, name: 'Blaugrana' } },
];

// "Lions", "Detroit Lions", "michigan football" -> team (exact name first, then aliases)
function findTeam(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return null;
  return TEAMS.find((t) => t.name.toLowerCase() === q || t.key === q)
    || TEAMS.find((t) => t.aliases.some((a) => q.includes(a)))
    || null;
}

module.exports = { TEAMS, findTeam };
