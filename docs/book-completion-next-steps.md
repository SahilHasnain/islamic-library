# Book Completion Next Steps

Current status: Phase 1 is implemented. The app can prompt near the end of a book, let the user confirm completion, manually mark a book completed or still reading, and show completed books in the Library.

## Phase 2: Smarter Detection

- Enforce a read-coverage threshold before prompting.
  - Recommended starting point: prompt only when `pagesViewed.length / totalPages >= 0.8`.
  - Keep manual completion available even when the threshold is not met.
- Track real session count per book edition.
  - Increment once per reader open, not on every progress save.
  - Store it on `ReadingProgress.sessionCount`.
- Use session count as an optional quality signal.
  - Avoid blocking short books or one-sitting reads too aggressively.
  - Consider requiring multiple sessions only for long books.
- Improve `pagesViewed` tracking.
  - Cap or compress storage if very large books make the array too large.
  - Keep pages sorted and unique.
- Avoid repeated completion prompts across app launches.
  - Store dismissed completion prompts separately from confirmed completions.
  - Allow manual completion even after dismissing the prompt.

## Phase 3: Delight And Insights

- Add completion stats.
  - Total completed books.
  - Completed pages.
  - Recent completions.
  - Average completion time when enough data exists.
- Add reading achievements.
  - First completed book.
  - Multi-volume completion.
  - Reading streak milestones.
- Add next-book suggestions.
  - Start simple with same-category recommendations.
  - Later use authored metadata such as tags, category, and reading tone.
- Improve completed library UX.
  - Make completed books collapsible if the list grows.
  - Show completion date and edition clearly.
  - Provide a direct `Read Again` action.

## Technical Notes

- `BookCompletion` is persisted through `useBookCompletions`.
- `ReadingProgress.pagesViewed` already exists as the foundation for percentage-read checks.
- `ReadingProgress.sessionCount` exists in the type, but still needs true session increment logic.
- Current reader detection uses:
  - final 3 pages
  - 2 minutes on final pages
  - user confirmation before marking complete

