UNIT_TESTS = $$(find test/unit -name "*.test.js")
INTEGRATION_TESTS = $$(find test/integration -name "*.test.js")
test: 
	mocha -R spec --ignore-leaks $(UNIT_TESTS) $(INTEGRATION_TESTS)

unit: 
	mocha -R spec $(UNIT_TESTS)

integration: 
	mocha -R spec --ignore-leaks $(INTEGRATION_TESTS)

special:
	mocha --ignore-leaks test/integration/channelRankManager.test.js

.PHONY: test unit integration

