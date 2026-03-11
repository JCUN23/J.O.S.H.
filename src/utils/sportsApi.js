/* utils/sportsApi.js */

/* ---------- HELPERS ---------- */

const formatTime = (date) =>
    new Date(date).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

const getGamesSplit = (events) => {
    const now = new Date();

    const past = events
        .filter(e => new Date(e.date) <= now)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    const future = events
        .filter(e => new Date(e.date) > now)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
        past,
        future,
        last: past[0] || null,
        next: future[0] || null,
    };
};

const parseGame = (game, teamAbbr) => {
    if (!game) return null;

    const c = game.competitions?.[0];
    if (!c) return null;

    const home = c.competitors.find(t => t.homeAway === "home");
    const away = c.competitors.find(t => t.homeAway === "away");

    const isHome = home.team.abbreviation === teamAbbr;
    const team = isHome ? home : away;
    const opp = isHome ? away : home;

    const completed = c.status.type.completed;
    const teamScore = completed ? Number(team.score?.value) : null;
    const oppScore = completed ? Number(opp.score?.value) : null;

    let result = null;
    if (completed) {
        if (teamScore > oppScore) result = "win";
        else if (teamScore < oppScore) result = "loss";
        else result = "tie";
    }

    return {
        opponent: `${isHome ? "vs" : "@"} ${opp.team.displayName}`,
        time: formatTime(game.date),
        score: completed ? `${teamScore}-${oppScore}` : null,
        result,
        isLive: c.status.type.state === "in",
    };
};

const calculateStreak = (pastGames, teamAbbr) => {
    let streakType = null;
    let count = 0;

    for (const g of pastGames) {
        const parsed = parseGame(g, teamAbbr);
        if (!parsed?.result || parsed.result === "tie") break;

        if (!streakType) {
            streakType = parsed.result;
            count = 1;
        } else if (parsed.result === streakType) {
            count++;
        } else break;
    }

    if (!streakType) return null;
    return `${streakType === "win" ? "W" : "L"}${count}`;
};

/* ---------- STANDINGS ---------- */

async function fetchStandings(url, teamAbbr) {
    try {
        const res = await fetch(url);
        const data = await res.json();

        const team = data.standings?.entries?.find(
            e => e.team.abbreviation === teamAbbr
        );

        if (!team) return {};

        const record = team.stats.find(s => s.name === "overall");
        const conf = team.stats.find(s => s.name === "conference");
        const div = team.stats.find(s => s.name === "division");

        return {
            record: record?.displayValue ?? null,
            conference: team.team.conference?.name ?? null,
            division: team.team.division?.name ?? null,
            conferenceRank: conf?.rank ?? null,
            divisionRank: div?.rank ?? null,
        };
    } catch {
        return {};
    }
}

/* ---------- CORE FETCHER ---------- */

async function fetchTeam({
    scheduleUrl,
    standingsUrl,
    teamName,
    teamAbbr,
    espnLink,
}) {
    try {
        const scheduleRes = await fetch(scheduleUrl);
        const scheduleData = await scheduleRes.json();
        const events = scheduleData.events || [];

        if (!events.length) return null;

        // eslint-disable-next-line no-unused-vars
        const { past, future, last, next } = getGamesSplit(events);
        const streak = calculateStreak(past, teamAbbr);
        const standings = standingsUrl
            ? await fetchStandings(standingsUrl, teamAbbr)
            : {};

        const lastParsed = parseGame(last, teamAbbr);
        const nextParsed = parseGame(next, teamAbbr);

        return {
            team: teamName,
            espnLink,
            ...standings,
            streak,
            lastGame: lastParsed,
            nextGame: nextParsed,
            isLive: lastParsed?.isLive ?? false,
        };
    } catch (err) {
        console.error(`Error fetching ${teamName}`, err);
        return null;
    }
}

/* ---------- EXPORTS ---------- */

export const getLionsGames = () =>
    fetchTeam({
        teamName: "Detroit Lions",
        teamAbbr: "DET",
        espnLink: "https://www.espn.com/nfl/team/_/name/det/detroit-lions",
        scheduleUrl:
            "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/8/schedule",
        standingsUrl:
            "https://site.api.espn.com/apis/site/v2/sports/football/nfl/standings",
    });

export const getMichiganGames = () =>
    fetchTeam({
        teamName: "Michigan Football",
        teamAbbr: "MICH",
        espnLink: "https://www.espn.com/college-football/team/_/id/130/michigan-wolverines",
        scheduleUrl:
            "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/130/schedule",
    });

export const getMichiganBasketballGames = () =>
    fetchTeam({
        teamName: "Michigan Basketball",
        teamAbbr: "MICH",
        espnLink: "https://www.espn.com/mens-college-basketball/team/_/id/130/michigan-wolverines",
        scheduleUrl:
            "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/130/schedule",
    });

export const getPistonGames = () =>
    fetchTeam({
        teamName: "Detroit Pistons",
        teamAbbr: "DET",
        espnLink: "https://www.espn.com/nba/team/_/name/det/detroit-pistons",
        scheduleUrl:
            "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/8/schedule",
        standingsUrl:
            "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/standings",
    });

export const getBarcelonaGames = () =>
    fetchTeam({
        teamName: "FC Barcelona",
        teamAbbr: "BAR",
        espnLink: "https://www.espn.com/soccer/team/_/id/83/barcelona",
        scheduleUrl:
            "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams/83/schedule",
        standingsUrl:
            "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/standings",
    });
