
# Create structure tree
tree:
	@tree -I '.git|node_modules|.DS_Store' -o structure.txt

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

# Delete volume
clean-db:
	@rm -rf $HOME/data/db/*


