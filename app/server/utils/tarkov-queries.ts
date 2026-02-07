// Query to fetch all items - used for complete item reference data
export const TARKOV_ITEMS_QUERY = `
  query TarkovItems($lang: LanguageCode) {
    items(lang: $lang) {
      id
      shortName
      name
      link
      wikiLink
      image512pxLink
      iconLink
      backgroundColor
      types
      category {
        name
      }
    }
  }
`;
// Lightweight items for initial UI hydration (avoid heavy payload)
export const TARKOV_ITEMS_LITE_QUERY = `
  query TarkovItemsLite($lang: LanguageCode) {
    items(lang: $lang) {
      id
      shortName
      name
      image512pxLink
      iconLink
      backgroundColor
    }
  }
`;
// Query to fetch prestige levels and requirements
export const TARKOV_PRESTIGE_QUERY = `
  query TarkovPrestige {
    prestige {
      id
      name
      prestigeLevel
      imageLink
      iconLink
      conditions {
        id
        description
        __typename
        ... on TaskObjectiveTaskStatus {
          task {
            id
            name
          }
          status
        }
      }
      rewards {
        traderStanding {
          trader {
            id
            name
          }
          standing
        }
      }
      transferSettings {
        __typename
      }
    }
  }
`;
// Lightweight bootstrap query for player levels (used for early UI render)
export const TARKOV_BOOTSTRAP_QUERY = `
  query TarkovBootstrap {
    playerLevels {
      level
      exp
      levelBadgeImageLink
    }
  }
`;
// Core task data without objectives or rewards (keeps payload small)
export const TARKOV_TASKS_CORE_QUERY = `
  query TarkovTasksCore($lang: LanguageCode, $gameMode: GameMode) {
    tasks(lang: $lang, gameMode: $gameMode) {
      id
      name
      trader {
        id
        name
        imageLink
      }
      map {
        id
        name
      }
      kappaRequired
      lightkeeperRequired
      experience
      wikiLink
      minPlayerLevel
      taskRequirements {
        task {
          id
          name
        }
        status
      }
      traderRequirements {
        trader {
          id
          name
        }
        value
      }
      factionName
    }
    maps {
      id
      name
      normalizedName
      enemies
      raidDuration
      players
      extracts {
        id
        name
        faction
        position {
          x
          y
          z
        }
        top
        bottom
      }
    }
    traders {
      id
      name
      normalizedName
      resetTime
      imageLink
      levels {
        id
        level
        requiredPlayerLevel
        requiredReputation
        requiredCommerce
        payRate
      }
    }
  }
`;
export const TARKOV_MAP_SPAWNS_QUERY = `
  query TarkovMapSpawns($lang: LanguageCode, $gameMode: GameMode) {
    maps(lang: $lang, gameMode: $gameMode) {
      id
      name
      spawns {
        zoneName
        sides
        categories
        position {
          x
          y
          z
        }
      }
    }
  }
`;
const ITEM_REF_FRAGMENT = `
  fragment ItemRef on Item {
    id
    link
    wikiLink
    iconLink
    image512pxLink
    backgroundColor
    properties {
      ... on ItemPropertiesWeapon {
        defaultPreset {
          id
          iconLink
          image512pxLink
          backgroundColor
        }
      }
    }
  }
`;
// Task objectives (and fail conditions) split out to reduce core payload
export const TARKOV_TASKS_OBJECTIVES_QUERY = `
  ${ITEM_REF_FRAGMENT}
  fragment QuestItemData on QuestItem {
    id
    shortName
    name
    image512pxLink
    gridImageLink
    baseImageLink
    iconLink
  }
  fragment CategoryData on ItemCategory {
    id
    name
    normalizedName
  }
  fragment MapPositionData on MapPosition {
    x
    y
    z
  }
  fragment MapWithPositionsData on MapWithPosition {
    map {
      id
    }
    positions {
      ...MapPositionData
    }
  }
  fragment TaskZoneData on TaskZone {
    id
    map {
      id
    }
    position {
      ...MapPositionData
    }
    outline {
      ...MapPositionData
    }
    top
    bottom
  }
  fragment ObjectiveRequiredKeys on TaskObjective {
    ... on TaskObjectiveBasic {
      requiredKeys {
        ...ItemRef
      }
    }
    ... on TaskObjectiveExtract {
      requiredKeys {
        ...ItemRef
      }
    }
    ... on TaskObjectiveItem {
      requiredKeys {
        ...ItemRef
      }
    }
    ... on TaskObjectiveMark {
      requiredKeys {
        ...ItemRef
      }
    }
    ... on TaskObjectiveQuestItem {
      requiredKeys {
        ...ItemRef
      }
    }
    ... on TaskObjectiveShoot {
      requiredKeys {
        ...ItemRef
      }
    }
    ... on TaskObjectiveUseItem {
      requiredKeys {
        ...ItemRef
      }
    }
  }
  query TarkovTaskObjectives($lang: LanguageCode, $gameMode: GameMode) {
    tasks(lang: $lang, gameMode: $gameMode) {
      id
      objectives {
        id
        description
        type
        maps {
          id
          name
        }
        ...ObjectiveRequiredKeys
        optional
        __typename
        ... on TaskObjectiveBasic {
          zones {
            ...TaskZoneData
          }
        }
        ... on TaskObjectiveBuildItem {
          item {
            ...ItemRef
          }
          containsAll {
            ...ItemRef
          }
          containsCategory {
            ...CategoryData
            parent {
              ...CategoryData
            }
            children {
              ...CategoryData
            }
          }
          attributes {
            name
            requirement {
              compareMethod
              value
            }
          }
        }
        ... on TaskObjectiveExperience {
          healthEffect {
            bodyParts
            effects
            time {
              compareMethod
              value
            }
          }
        }
        ... on TaskObjectiveExtract {
          exitStatus
          zoneNames
        }
        ... on TaskObjectiveHideoutStation {
          hideoutStation {
            id
            name
          }
          stationLevel
        }
        ... on TaskObjectiveItem {
          zones {
            ...TaskZoneData
          }
          items {
            ...ItemRef
          }
          count
          foundInRaid
          dogTagLevel
          maxDurability
          minDurability
        }
        ... on TaskObjectiveMark {
          markerItem {
            ...ItemRef
          }
          zones {
            ...TaskZoneData
          }
        }
        ... on TaskObjectivePlayerLevel {
          playerLevel
        }
        ... on TaskObjectiveQuestItem {
          possibleLocations {
            ...MapWithPositionsData
          }
          zones {
            ...TaskZoneData
          }
          questItem {
            ...QuestItemData
          }
          count
        }
        ... on TaskObjectiveShoot {
          shotType
          targetNames
          count
          zoneNames
          bodyParts
          usingWeapon {
            ...ItemRef
          }
          usingWeaponMods {
            ...ItemRef
          }
          wearing {
            ...ItemRef
          }
          notWearing {
            ...ItemRef
          }
          distance {
            compareMethod
            value
          }
          playerHealthEffect {
            bodyParts
            effects
            time {
              compareMethod
              value
            }
          }
          enemyHealthEffect {
            bodyParts
            effects
            time {
              compareMethod
              value
            }
          }
          zones {
            ...TaskZoneData
          }
        }
        ... on TaskObjectiveSkill {
          skillLevel {
            name
            level
            skill {
              id
              name
              imageLink
            }
          }
        }
        ... on TaskObjectiveTaskStatus {
          task {
            id
            name
          }
          status
        }
        ... on TaskObjectiveTraderLevel {
          trader {
            id
            name
          }
          level
        }
        ... on TaskObjectiveTraderStanding {
          trader {
            id
            name
          }
          compareMethod
          value
        }
        ... on TaskObjectiveUseItem {
          useAny {
            ...ItemRef
          }
          zones {
            ...TaskZoneData
          }
          count
        }
      }
      failConditions {
        id
        description
        type
        maps {
          id
          name
        }
        ...ObjectiveRequiredKeys
        optional
        __typename
        ... on TaskObjectiveBasic {
          zones {
            ...TaskZoneData
          }
        }
        ... on TaskObjectiveBuildItem {
          item {
            ...ItemRef
          }
          containsAll {
            ...ItemRef
          }
          containsCategory {
            ...CategoryData
            parent {
              ...CategoryData
            }
            children {
              ...CategoryData
            }
          }
          attributes {
            name
            requirement {
              compareMethod
              value
            }
          }
        }
        ... on TaskObjectiveExperience {
          healthEffect {
            bodyParts
            effects
            time {
              compareMethod
              value
            }
          }
        }
        ... on TaskObjectiveExtract {
          exitStatus
          zoneNames
        }
        ... on TaskObjectiveHideoutStation {
          hideoutStation {
            id
            name
          }
          stationLevel
        }
        ... on TaskObjectiveItem {
          zones {
            ...TaskZoneData
          }
          items {
            ...ItemRef
          }
          count
          foundInRaid
          dogTagLevel
          maxDurability
          minDurability
        }
        ... on TaskObjectiveMark {
          markerItem {
            ...ItemRef
          }
          zones {
            ...TaskZoneData
          }
        }
        ... on TaskObjectivePlayerLevel {
          playerLevel
        }
        ... on TaskObjectiveQuestItem {
          possibleLocations {
            ...MapWithPositionsData
          }
          zones {
            ...TaskZoneData
          }
          questItem {
            ...QuestItemData
          }
          count
        }
        ... on TaskObjectiveShoot {
          shotType
          targetNames
          count
          zoneNames
          bodyParts
          usingWeapon {
            ...ItemRef
          }
          usingWeaponMods {
            ...ItemRef
          }
          wearing {
            ...ItemRef
          }
          notWearing {
            ...ItemRef
          }
          distance {
            compareMethod
            value
          }
          playerHealthEffect {
            bodyParts
            effects
            time {
              compareMethod
              value
            }
          }
          enemyHealthEffect {
            bodyParts
            effects
            time {
              compareMethod
              value
            }
          }
          zones {
            ...TaskZoneData
          }
        }
        ... on TaskObjectiveSkill {
          skillLevel {
            name
            level
            skill {
              id
              name
              imageLink
            }
          }
        }
        ... on TaskObjectiveTaskStatus {
          task {
            id
            name
          }
          status
        }
        ... on TaskObjectiveTraderLevel {
          trader {
            id
            name
          }
          level
        }
        ... on TaskObjectiveTraderStanding {
          trader {
            id
            name
          }
          compareMethod
          value
        }
        ... on TaskObjectiveUseItem {
          useAny {
            ...ItemRef
          }
          zones {
            ...TaskZoneData
          }
          count
        }
      }
    }
  }
`;
// Task rewards split out to reduce core payload
export const TARKOV_TASKS_REWARDS_QUERY = `
  ${ITEM_REF_FRAGMENT}
  query TarkovTaskRewards($lang: LanguageCode, $gameMode: GameMode) {
    tasks(lang: $lang, gameMode: $gameMode) {
      id
      startRewards {
        traderStanding {
          trader {
            id
            name
          }
          standing
        }
        items {
          count
          item {
            ...ItemRef
            containsItems {
              item {
                ...ItemRef
              }
              count
            }
          }
        }
        offerUnlock {
          id
          trader {
            id
            name
          }
          level
          item {
            ...ItemRef
            containsItems {
              count
              item {
                ...ItemRef
              }
            }
          }
        }
        skillLevelReward {
          name
          level
          skill {
            id
            name
            imageLink
          }
        }
        traderUnlock {
          id
          name
        }
      }
      finishRewards {
        traderStanding {
          trader {
            id
            name
          }
          standing
        }
        items {
          count
          item {
            ...ItemRef
            containsItems {
              item {
                ...ItemRef
              }
              count
            }
          }
        }
        offerUnlock {
          id
          trader {
            id
            name
          }
          level
          item {
            ...ItemRef
            containsItems {
              count
              item {
                ...ItemRef
              }
            }
          }
        }
        skillLevelReward {
          name
          level
          skill {
            id
            name
            imageLink
          }
        }
        traderUnlock {
          id
          name
        }
      }
      failureOutcome {
        traderStanding {
          trader {
            id
            name
          }
          standing
        }
        items {
          count
          item {
            ...ItemRef
            containsItems {
              item {
                ...ItemRef
              }
              count
            }
          }
        }
        offerUnlock {
          id
          trader {
            id
            name
          }
          level
          item {
            ...ItemRef
            containsItems {
              count
              item {
                ...ItemRef
              }
            }
          }
        }
        skillLevelReward {
          name
          level
          skill {
            id
            name
            imageLink
          }
        }
        traderUnlock {
          id
          name
        }
      }
    }
  }
`;
