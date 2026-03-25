# Rise of Kingdom Discord bot

development has slowed down
This project is to help guide players learn more about the game RISE OF
KINGDOMS.

## Folder structure

```

  Folder structure 

/src
  /commands
    /events
      create-event.ts
      list-events.ts
      delete-event.ts
    /reminders
      set-reminder.ts
      list-reminders.ts
    /admin
      leaderboard.ts
      manage-roles.ts
    /utility
      ping.ts
      help.ts

  /features                   ← each feature is fully self-contained
    /reminders
      ReminderScheduler.ts    ← scheduling logic
      ReminderJob.ts          ← fires individual reminders
      reminderHelpers.ts      ← pure utility functions for this feature
      reminder.types.ts       ← types/interfaces scoped to reminders
    /activity-tracking
      ActivityTracker.ts
      ParticipationStore.ts
      activityHelpers.ts
      activity.types.ts
    /events
      EventManager.ts
      occurrenceCalculator.ts
      event.types.ts

  /db
    /models
      Event.ts
      ReminderLog.ts
      PlayerActivity.ts
    /repositories            ← one file per model, handles all DB queries
      eventRepository.ts
      reminderRepository.ts
      activityRepository.ts
    db.ts                    ← connection setup only

  /base
    /classes
      CustomClient.ts
    /interfaces
      ICommand.ts
      IEvent.ts
    /constants
      BOT_CONSTANTS.ts       ← e.g. default reminder offsets, score weights

  /utils
    logger.ts
    dateUtils.ts
    embedBuilder.ts

  /types
    global.d.ts              ← augments discord.js types e.g. client.commands
  
  main.ts
  deploy-commands.ts
  ```

## Usage

The usage for this bot will be as follows:

- Commanders - Gives optimal ways to play a specific commander. Talent trees,
  and best pairings. You have to give the first name of the commander Usage:
  !tree

- 8 Ball - Get mystical predictions for a yes or no question. Usage: !ball or
  !8ball

- Sun Tzu Quotes - Give you famous qoutes from the famous hero Sun Tzu Usage:
  !wise

- City Hall Upgrades - Learn information about city to level up Usage: !city

- Poll - Ask a polling question. Vote by emoji reaction. Question and options
  must be wrapped in double quotes. Questions with no provided options are
  treated as Yes / No / Unsure questions. Usage: !poll "Thoughtful question
  here?" "Optional Answer A" "Optional Answer B"

- Donate - Donations are not expected but are appreciated. Usage: !donate

- Castle Upgrades - Learn information about castle upgrades Usage: !castle

- Updates - Changes made in to the bot commands will be added here for Usage:
  !updates

- Rock, Paper, Scissors - Play a fun game with the bot of rock paper scissors
  Usage: !game

- Count Down - A count down an important message. The d = day(s) h = hour(s) m =
  minute(s), Usage: !cd [title_of_envent_no_spaces] [number]d [number]h
  [number]m and Usage: !countdown or !cd

## Tech Stack

This project was made with

- Discord.js
- Node.js
- Javascript
- eslint
