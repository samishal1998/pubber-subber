# gcp-pubsub

Auto-creates a subscription (`ephemeral: true` deletes it on shutdown). Works against either a real GCP project or the local emulator.

## Run (emulator)

```sh
gcloud beta emulators pubsub start --project=test-project --host-port=0.0.0.0:8085
export PUBSUB_EMULATOR_HOST=localhost:8085
export PUBSUB_PROJECT_ID=test-project
# Pre-create the topic the example expects.
gcloud --project=test-project pubsub topics create demo-topic
pnpm start
```

## Run (production)

Set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account key file and `PUBSUB_PROJECT_ID` to your project. Make sure the topic exists or pre-create it.
