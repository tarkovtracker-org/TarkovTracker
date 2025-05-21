window.openapi = {
  "openapi": "3.0.0",
  "info": {
    "title": "TarkovTracker API (Fork)",
    "description": "Player's progress, objectives, level, reputation and more.",
    "version": "2.0",
    "contact": {
      "name": "TarkovTracker GitHub",
      "url": "https://github.com/tarkovtracker-org/TarkovTracker"
    },
    "license": {
      "name": "GNU General Public License v3.0",
      "url": "https://www.gnu.org/licenses/gpl-3.0.en.html"
    }
  },
  "servers": [
    {
      "url": "https://tarkov-tracker-dev.web.app/api/v2",
      "description": "TarkovTracker DEV API v2 endpoint"
    }
  ],
  "tags": [
    {
      "name": "Token",
      "description": "Operations related to API tokens"
    },
    {
      "name": "Progress",
      "description": "Operations related to player and team progress"
    }
  ],
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      }
    }
  },
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "paths": {}
};