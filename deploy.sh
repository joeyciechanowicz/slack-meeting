#gcloud beta functions deploy meeting --trigger-http --runtime nodejs8 --region europe-west1
#gcloud beta functions deploy authRedirect --trigger-http --runtime nodejs8 --region europe-west1
#gcloud beta functions deploy interaction --trigger-http --region europe-west1
gcloud beta functions deploy meetingSub --trigger-resource MEETING_MESSAGES --runtime nodejs8 --trigger-event google.pubsub.topic.publish --region europe-west1