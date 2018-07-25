#gcloud beta functions deploy meeting --trigger-http --region europe-west1
#gcloud beta functions deploy interaction --trigger-http --region europe-west1
gcloud beta functions deploy meetingSub --trigger-resource MEETING_MESSAGES --trigger-event google.pubsub.topic.publish --region europe-west1