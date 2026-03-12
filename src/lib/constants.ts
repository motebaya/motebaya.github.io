// Social links, GitHub config, and shared constants

export const GITHUB_USERNAME = "motebaya";
export const GITHUB_AVATAR_URL = `https://avatars.githubusercontent.com/u/106154800`;
export const GITHUB_REPOS_API = `https://api.github.com/users/${GITHUB_USERNAME}/repos`;

export const SOCIAL_LINKS = [
  {
    name: "GitHub",
    url: `https://github.com/${GITHUB_USERNAME}`,
    label: "GitHub",
  },
  {
    name: "Telegram",
    url: "https://t.me/dvinchii",
    label: "Telegram",
  },
  {
    name: "X",
    url: "https://x.com/vinsmochi71",
    label: "X (Twitter)",
  },
  {
    name: "YouTube",
    url: "https://www.youtube.com/@ItsMochino",
    label: "YouTube",
  },
] as const;

export const THEME_STORAGE_KEY = "theme";
export const SCROLL_TOP_THRESHOLD = 300;
