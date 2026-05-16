# aws-sns-sqs

SNS publishes → SQS receives. Uses `compose()` to wire the two adapters into a single duplex PubSub.

## Run (LocalStack)

```sh
docker run --rm -d -p 4566:4566 -e SERVICES=sns,sqs localstack/localstack
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test

aws --endpoint-url=$AWS_ENDPOINT_URL sqs create-queue --queue-name orders > /dev/null
aws --endpoint-url=$AWS_ENDPOINT_URL sns create-topic --name orders > /dev/null
TOPIC=$(aws --endpoint-url=$AWS_ENDPOINT_URL sns list-topics --query 'Topics[0].TopicArn' --output text)
QUEUE=$(aws --endpoint-url=$AWS_ENDPOINT_URL sqs get-queue-url --queue-name orders --query QueueUrl --output text)
QUEUE_ARN=$(aws --endpoint-url=$AWS_ENDPOINT_URL sqs get-queue-attributes --queue-url $QUEUE --attribute-names QueueArn --query Attributes.QueueArn --output text)
aws --endpoint-url=$AWS_ENDPOINT_URL sns subscribe --topic-arn $TOPIC --protocol sqs --notification-endpoint $QUEUE_ARN

export SNS_TOPIC_ARN=$TOPIC
export SQS_QUEUE_URL=$QUEUE

pnpm start
```

## Run (production)

Replace LocalStack URLs with real ones, drop `AWS_ENDPOINT_URL`, and provide AWS credentials via the usual mechanisms (environment, profile, IRSA, etc.).
