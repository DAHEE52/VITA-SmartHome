# AWS Lambda 배포 가이드

VITA FastAPI 백엔드를 AWS Lambda + Lambda Function URL로 배포하는 절차. `SmartHome/WP_02`의 배포 방식(Mangum + Function URL)을 그대로 따르되, 콘솔 클릭 대신 AWS CLI로 진행한다.

## 0. 사전 준비

- AWS 계정 (가입/결제수단/본인인증까지 완료된 상태여야 함)
- `aws configure`로 이 PC에 access key 등록 (리전은 `ap-northeast-2`)
- `aws sts get-caller-identity`로 자격증명 확인되는지 체크

## 1. 코드 (이미 준비됨)

- `backend/lambda_handler.py` — `from mangum import Mangum; from API_main import app; handler = Mangum(app)`
- `backend/requirements-lambda.txt` — `requirements.txt`에서 `uvicorn`/`pytest` 제외, `mangum` 추가

## 2. 배포 패키지(zip) 만들기

Lambda는 Linux(x86_64) 런타임이라, Windows에서도 Linux용 휠을 받아 패키징해야 한다.

```bash
cd backend
rm -rf build lambda_deploy.zip
pip install --platform manylinux2014_x86_64 --implementation cp --python-version 3.13 \
  --only-binary=:all: --target ./build -r requirements-lambda.txt
cp API_main.py lambda_handler.py build/
cp -r app build/
cd build && zip -r ../lambda_deploy.zip . -x '*__pycache__*' && cd ..
```

> `supabase` 패키지가 여러 하위 패키지(postgrest/realtime/storage3/supabase_auth/supabase_functions)를 딸려오므로 zip 용량이 콘솔 직접 업로드 한도(50MB, 압축 기준)를 넘을 수 있다. 넘으면 S3 업로드 경유로 전환한다 (`aws s3 cp lambda_deploy.zip s3://<버킷>/` 후 `aws lambda update-function-code --s3-bucket ... --s3-key ...`).

## 3. IAM 실행 역할 생성

```bash
aws iam create-role --role-name vita-backend-lambda-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam attach-role-policy --role-name vita-backend-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

역할 생성 직후 바로 함수를 만들면 IAM 전파 지연으로 에러가 날 수 있음 — 10~20초 정도 대기 후 4단계 진행.

## 4. Lambda 함수 생성

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws lambda create-function \
  --function-name vita-backend \
  --runtime python3.13 \
  --architectures x86_64 \
  --handler lambda_handler.handler \
  --role arn:aws:iam::$ACCOUNT_ID:role/vita-backend-lambda-role \
  --timeout 15 \
  --memory-size 512 \
  --region ap-northeast-2 \
  --zip-file fileb://backend/lambda_deploy.zip \
  --environment "Variables={SUPABASE_URL=<실제값>,SUPABASE_SERVICE_KEY=<실제값>,DEVICE_API_KEY=<실제값>}"
```

환경변수 3개는 `backend/.env`에 있는 값을 그대로 사용 (파일로 커밋되지 않고 Lambda 설정에만 저장됨).

## 5. Function URL 활성화

```bash
aws lambda create-function-url-config \
  --function-name vita-backend \
  --auth-type NONE \
  --region ap-northeast-2

aws lambda add-permission \
  --function-name vita-backend \
  --statement-id FunctionURLAllowPublicAccess \
  --action lambda:InvokeFunctionUrl \
  --principal '*' \
  --function-url-auth-type NONE \
  --region ap-northeast-2
```

CORS는 별도 설정하지 않는다 — `API_main.py`의 `CORSMiddleware`(`allow_origins=["*"]`)가 이미 처리하고, Mangum이 OPTIONS 프리플라이트도 그대로 앱에 전달한다.

Function URL 확인:
```bash
aws lambda get-function-url-config --function-name vita-backend --region ap-northeast-2 --query FunctionUrl --output text
```

## 6. 동작 확인

```bash
URL=$(aws lambda get-function-url-config --function-name vita-backend --region ap-northeast-2 --query FunctionUrl --output text)
curl "${URL}health"
curl -X POST "${URL}devices/register" -H "Content-Type: application/json" -H "X-Device-Key: <DEVICE_API_KEY>" \
  -d '{"device_id":"test-01","type":"env_sensor","room":"test","label":"test"}'
```

Supabase 대시보드 Table Editor에서 `devices` 테이블에 row가 쌓이는지 확인.

## 7. 코드 수정 후 재배포

```bash
cd backend
cp API_main.py lambda_handler.py build/
cp -r app build/
cd build && zip -r ../lambda_deploy.zip . -x '*__pycache__*' && cd ..
aws lambda update-function-code --function-name vita-backend --zip-file fileb://lambda_deploy.zip --region ap-northeast-2
```

`requirements-lambda.txt`가 바뀐 경우 2단계(패키징)부터 다시 수행.

## 8. 정리(리소스 삭제)

```bash
aws lambda delete-function-url-config --function-name vita-backend --region ap-northeast-2
aws lambda delete-function --function-name vita-backend --region ap-northeast-2
aws iam detach-role-policy --role-name vita-backend-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name vita-backend-lambda-role
```
