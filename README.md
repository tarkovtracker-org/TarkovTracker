# TarkovTracker

A comprehensive web application for tracking your progress in Escape From Tarkov. Track tasks, hideout upgrades, and required items while coordinating with your team.

## 🚨 Important Notice

This is a community maintained fork of the original [TarkovTracker](https://github.com/TarkovTracker/TarkovTracker) project.

- Original project: <https://tarkovtracker.io>
- This fork will be hosted at: <https://tarkovtracker.org>
- The original maintainer [@Thaddeus](https://github.com/thaddeus) has been inactive (~1 year)
- This fork aims to continue development and maintenance for the community
- The original owner is welcome to regain access/ownership if they return
- While not a primary focus, we commit to reviewing PRs and maintaining dependencies

## ✨ Features

- Track tasks and objectives by trader and map
- Monitor hideout upgrade progress
- Track required items for tasks and hideout upgrades
- Team system for coordinating with friends
- Works offline using local storage
- No authentication required for basic functionality

## 🤝 Contributing

**We welcome all contributions! This is a community-driven project.**

- All contributions, big or small, are appreciated
- Constructive feedback will be provided on all PRs
- Previous contributors/maintainers from the original project are welcome to reach out
- Looking to become a maintainer? Show dedication through quality contributions

## 🛠️ Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/en/download/) 18.0 or higher
- Java JRE 11+ or higher (for [Firebase Emulator](https://firebase.google.com/docs/emulator-suite/install_and_configure))

### Installation

1. Clone the repository
2. Install frontend dependencies:

   ```bash
   cd tarkov-tracker
   npm install
   ```

3. Install backend dependencies:

   ```bash
   cd functions
   npm install
   ```

4. Start development server:

   ```bash
   cd tarkov-tracker
   npm run dev
   ```

## 🏗️ Project Structure

The project consists of two main components:

1. **Frontend (SPA)**

   - Located in `/tarkov-tracker`
   - Built with Vue.js
   - Can function independently using local storage

2. **Backend (API)**
   - Located in `/functions`
   - Built with Firebase Cloud Functions
   - Required only for team features and third-party API access

## 📝 License

This project retains the original GNU General Public License v3.0 from the original TarkovTracker project. See [LICENSE.md](LICENSE.md) for the full license text.

## 🙏 Acknowledgments

- Original TarkovTracker team and [@Thaddeus](https://github.com/thaddeus)
- All contributors and community members
