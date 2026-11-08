# Changelog

All notable user-visible changes to G4 Studio are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- Autonomous run view with storm visuals and lightning animations (6595dc8).
- Recordings now go through a Hub recordings client (0531f96).
- The Settings editor shows recorders that are already running before a recording starts (380986a).
- Popover behavior for the select and toggle-dropdown controls (11d819e).
- Sections can be opened and closed from the keyboard (e628a9f).
- New-Project asks before it overwrites an existing project (8a08d4a).
- Publish asks before it overwrites a changed bot, and publisher tabs are restored (dd14ee7).
- The extension runs fully in untrusted folders instead of a limited Restricted Mode (0dd73a2).
- Backward compatibility for the legacy offset contract when a recorder stops (f78f7f1).

### Changed

- Fonts in the docs and CSS now use the VS Code font variables (130e2cd).
- Secondary buttons use the theme's secondary button colors (1e971bd).
- The G4 Bots Manager view is hidden until it has a provider (1b8c06e).
- Update-Environment, Update-Template and Sync-Cache report their real outcomes (e18eb11).
- Cache sync reports MCP servers and tools it could not use (b06edf6).
- A designer that cannot be loaded from the G4 Hub now explains why (d30273e).
- The Chrome base bot no longer has hard-coded sandbox paths (cda2bc0).
- The "TemplateAction" alias was removed from `template-base.json` (d7de4b6).

### Fixed

- Report loading errors are handled gracefully and Base64 validation is stricter (c64d589).
- An unreadable report shows an error page instead of closing its tab (14b4000).
- Report data is injected safely in the Report Viewer (c1ff7be).
- The Report Viewer plugin tree filter matches plugin names (42f0c7d).
- Only one Settings tab opens after an extension host restart (a491aaa).
- The settings reload prompt stays on screen after a save (c7746b9).
- A stored null repository list becomes `[]` on save (207bd2b, 2f8608e).
- Settings editor saves are kept safe and valid (527bbd8).
- Credentials are masked in designer console messages before they are logged (eb744d5).
- The template upload outcome survives an extension host restart (df908d7).
- Designer runs that have no token use the project token (f5cc8f0).
- Designer edits are written to the bot document (c7a1b79).
- The recorder panel shows the real recording state (6c94b33).
- One SignalR client is kept while the Hub is down, and recorders are probed correctly (47da7b5).
- The G4 Documentations tree is registered once (eed7fac).
- Repository card titles follow the repository name and the script hints are corrected (914f7da).
- Webview errors are logged with their message and stack (a15d79c).
