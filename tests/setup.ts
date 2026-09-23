process.env.SHEETS_TEST_MODE = "true";
process.env.ORDER_ACCESS_SECRET ||= "test-order-access-secret-at-least-thirty-two-characters";
process.env.OPERATOR_EMAIL ||= "owner@example.com";
process.env.OPERATOR_PASSWORD_HASH ||= "scrypt$MDEyMzQ1Njc4OWFiY2RlZg$YSoJIBxOMXyPCe_zAz87jDghCnPAJf4ktaMqRf02-JNoK35dFsgrhSCvDu1LPoF-J1IPw_AHwIPY4uWq-8J9UA";
process.env.OPERATOR_SESSION_SECRET ||= "test-operator-session-secret-at-least-thirty-two";
