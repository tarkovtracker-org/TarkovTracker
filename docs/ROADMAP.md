# TarkovTracker Roadmap & Personal Notes

Maintainer-owned working notes, ideas, and TODOs. Not auto-generated.

--- DO NOT TOUCH ANY OF THIS FILE CONTENT BELOW HERE, IT IS MANUALLY MAINTAINED ---

## PERSONAL NOTES AND THOUGHTS, IDEAS, etc

- Finish implementing Team System (Supabase Realtime) and Cloudflare Workers.
- Figure out the best way to handle the open-source API from the original TarkovTracker project and if there is better alternatives to NodeJS / Express for that service.
- Finish fixing the Settings page UI/UX and ensure ALL settings are visible to unauthenticated users while restricting what they can and cant do.
- Improve the i18n system to allow for easier translations and community contributions.
- Explore adding a PWA mode for offline tracking and notifications.
- Consider adding a donation or sponsorship system to help fund server costs.
- Regularly review and update dependencies to ensure security and performance.
- Audit the codebase for performance bottlenecks and optimize as needed.
- Plan for future features like raid analytics, gear recommendations, and more based on user feedback.
- Keep documentation up to date with any architectural changes or new features.
- Fix the initial loading performance issues as currently while loading the app it freezes for a few seconds before becoming responsive showing a blank white screen while caching and fetching data for the first visit.
- Try to find ways to consolidate the core API data and filtering logic to prevent issues like a task being filtered out of the users view but the needed items still being displayed and counted.
- Look into implementing better error handling and user feedback for network issues or data sync problems.
- Find out if the data migration system is still needed or if it can be refactored / reworked to work properly without potentially corrupting user data on import from .io or .org versions.
- Explore adding more detailed logging and analytics to track user behavior and app performance.
- Finish organizing the codebase to make it easier for new contributors to understand and navigate and maintain long term.
- Remove excess comments and dead code to clean up the codebase.
- Reduce abstractions, unnecessary composables, and over-engineering to simplify the codebase.
- Refactor large files into smaller, more manageable modules.
- Standardize coding styles and conventions across the codebase.
- Improve test coverage to ensure reliability and catch regressions early.
- Set up continuous integration and deployment (CI/CD) pipelines for automated testing and deployment.
- Regularly review and update the documentation to reflect the current state of the project.
  --- DO NOT TOUCH ANY OF THIS FILE CONTENT ABOVE HERE, IT IS MANUALLY MAINTAINED ---
