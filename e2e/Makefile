# Run e2e unit test with UI
test-ui:
	@npx playwright test --ui

# Run e2e test all case
test:
	@npx playwright test

# Show e2e report
report:
	@open combined-report/index.html 

# Start PM2
start:
	@./run.sh start

# Stop PM2
stop:
	@./run.sh stop
	@pm2 cleardump

# Restart PM2
restart:
	@./run.sh stop
	@pm2 cleardump
	@./run.sh start