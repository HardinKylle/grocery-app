# Firebase on the Blaze plan, with scheduled pushes from Cloud Functions

The app runs on Firebase (Google sign-in limited to an allow-list, Firestore with its offline cache, Hosting, Cloud Messaging) because one platform covers login, offline sync, and push for a two-person app. Expiry alerts and the Shopping Day reminder must go out at set times, which needs a scheduled Cloud Function, and Cloud Functions require the pay-as-you-go Blaze plan. One hourly scheduled function sends whatever is due. Expected cost is about $0 to $0.10 a month, well inside the free allowance, with a $1 budget alert. A budget alert only warns and does not cap spending.

## Considered Options

- **Spark (free) plan with no scheduled pushes**: rejected, because timed reminders are a core feature.
- **GitHub Actions cron sending pushes through the Firebase Admin SDK**: free and needs no card, but runs can start 15 to 60 minutes late and it adds a second platform to manage.
