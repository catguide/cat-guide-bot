// Jede Plattform hat url, errorType und optional errorMsg/errorCode
// errorType: "status_code" = 404 bedeutet nicht gefunden
//            "message" = Seite gibt 200 aber enthält Fehlertext

module.exports = [
  { name: 'GitHub', url: 'https://github.com/{}', errorType: 'status_code' },
  // Reddit blockiert Bots (403) — API nutzen
  { name: 'Reddit', url: 'https://www.reddit.com/user/{}/about.json', errorType: 'status_code' },
  { name: 'Twitter/X', url: 'https://twitter.com/{}', errorType: 'status_code' },
  // Instagram blockiert Bots — nur als Hinweis
  { name: 'YouTube', url: 'https://www.youtube.com/@{}', errorType: 'status_code' },
  // Twitch gibt immer 200 zurück — API nutzen
  { name: 'Twitch', url: 'https://www.twitch.tv/{}', errorType: 'message', errorMsg: 'content="Twitch"' },
  { name: 'SoundCloud', url: 'https://soundcloud.com/{}', errorType: 'status_code' },
  { name: 'Steam', url: 'https://steamcommunity.com/id/{}', errorType: 'message', errorMsg: 'The specified profile could not be found.' },
  // Roblox leitet auf /request-error?code=404
  { name: 'Roblox', url: 'https://www.roblox.com/user.aspx?username={}', errorType: 'redirect', errorUrl: 'request-error' },
  { name: 'Spotify', url: 'https://open.spotify.com/user/{}', errorType: 'status_code' },
  { name: 'Kick', url: 'https://kick.com/{}', errorType: 'status_code' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/in/{}', errorType: 'status_code' },
  { name: 'Tumblr', url: 'https://{}.tumblr.com', errorType: 'message', errorMsg: 'There\'s nothing here.' },
  { name: 'DeviantArt', url: 'https://www.deviantart.com/{}', errorType: 'status_code' },
  { name: 'Patreon', url: 'https://www.patreon.com/{}', errorType: 'status_code' },
  { name: 'Fiverr', url: 'https://www.fiverr.com/{}', errorType: 'status_code' },
  // Replit leitet auf /login wenn nicht gefunden
  { name: 'Replit', url: 'https://replit.com/@{}', errorType: 'redirect', errorUrl: 'login' },
  { name: 'GitLab', url: 'https://gitlab.com/{}', errorType: 'status_code' },
  { name: 'Keybase', url: 'https://keybase.io/{}', errorType: 'status_code' },
  { name: 'Letterboxd', url: 'https://letterboxd.com/{}', errorType: 'status_code' },
  { name: 'Last.fm', url: 'https://www.last.fm/user/{}', errorType: 'status_code' },
  { name: 'Vimeo', url: 'https://vimeo.com/{}', errorType: 'status_code' },
  { name: 'Medium', url: 'https://medium.com/@{}', errorType: 'status_code' },
  { name: 'Linktree', url: 'https://linktr.ee/{}', errorType: 'status_code' },
  // Ko-fi gibt 403 für alle = unzuverlässig, entfernt
  { name: 'Behance', url: 'https://www.behance.net/{}', errorType: 'status_code' },
  { name: 'Dribbble', url: 'https://dribbble.com/{}', errorType: 'status_code' },
  { name: 'GitHub', url: 'https://github.com/{}', errorType: 'status_code' },
  { name: 'Leetcode', url: 'https://leetcode.com/{}', errorType: 'status_code' },
  { name: 'DockerHub', url: 'https://hub.docker.com/u/{}', errorType: 'status_code' },
  { name: 'Bluesky', url: 'https://bsky.app/profile/{}.bsky.social', errorType: 'status_code' },
  // Duolingo gibt 200 für alles
  { name: 'Duolingo', url: 'https://www.duolingo.com/profile/{}', errorType: 'redirect', errorUrl: 'errors' },
  { name: 'Wattpad', url: 'https://www.wattpad.com/user/{}', errorType: 'status_code' },
  { name: 'Cashapp', url: 'https://cash.app/${}', errorType: 'status_code' },
  { name: 'Substack', url: 'https://{}.substack.com', errorType: 'status_code' },
  { name: 'Mastodon', url: 'https://mastodon.social/@{}', errorType: 'status_code' },
  { name: 'NPM', url: 'https://www.npmjs.com/~{}', errorType: 'status_code' },
  // Codeforces blockiert Bots (403)
  { name: 'Furaffinity', url: 'https://www.furaffinity.net/user/{}', errorType: 'message', errorMsg: 'This user cannot be found.' },
  { name: 'Chess.com', url: 'https://www.chess.com/member/{}', errorType: 'message', errorMsg: 'Oops! That page can\'t be found.' },
];
