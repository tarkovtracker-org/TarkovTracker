# TarkovTracker
This repository is for TarkovTracker, a web app for tracking your Escape From Tarkov tasks and hideout progress. It allows you to mark off tasks, objectives, and hideout upgrades as you complete them. You can see items needed for upgrades and tasks, as well as how close you are to needing them. Tasks are broken down into traders and maps, so you can prioritize them based on your goals and how you play. You can also join a team with your friends, and more easily plan out your raids together.

## This is a community maintained fork of the original [TarkovTracker](https://github.com/TarkovTracker/TarkovTracker) project.

- The original project is hosted at https://tarkovtracker.io this project will be hosted soon on https://tarkovtracker.org
- The owner/maintainer [@Thaddeus](https://github.com/thaddeus) has become inactive, for an extended period of time. (~1 Year Now)
- Due to this I decided to continue his work for the community, when or if he returns he is fully welcome to regain ownership/access to any related work.
- (I would still like to be a maintainer to ensure it is maintained if so, as it cost money, time, and effort to do this and would hate to see it wasted / repeated.)
- This project will not be my MAIN focus, I do have work & clients to tend to. I will attempt to at minimum keep tabs on this and review and push any PR's that fix or improve the project and keep dependencies updated.

## Contibutors / Maintainers

- **Any and all contributions are appreciated! I will be treating this project more as a community effort, so please if you want or can don't hesitate to help!**
- Worse case I will give helpful constructive feedback, so you can improve & fix any issues!
- If you are/were a contributor/maintainer involved with the original project, feel free to reach out to me. I would love to have more maintainers to ensure redundancy, in the event I have to step away also.
- If you are interested in becoming a maintainer, making high quality and good contributions showing dedication and interest for improving and helping is the best way. I will be happy to reach out to see if you are interested if I see anyone going above and beyond.

## Installation

The following are the steps to get the TarkovTracker project up and running in development.

### Prerequisites

- Node.js 16.0 or higher
- Java JRE 11+ or higher (for [Firebase Emulator](https://firebase.google.com/docs/emulator-suite/install_and_configure))

### Setup

1. Clone the repository
2. Run `npm install` in the `tarkov-tracker` directory
3. Run `npm install` in the `functions` directory
4. Run `npm run dev` in the `tarkov-tracker` directory

# Project Structure

The project is split into two main parts: the SPA frontend built with Vue.js, and the API backend using Firebase Cloud Functions. The frontend is located in the `tarkov-tracker` directory, and the backend is located in the `functions` directory. The project can function without a backend, other than hosting, allowing for full use of the site outside of the team system or API for third-party apps. The web app can work normally using local storage without user authentication.
