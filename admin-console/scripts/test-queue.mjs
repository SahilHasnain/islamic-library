/**
 * Test script for the job queue system
 * 
 * This script tests the queue API endpoints to ensure they work correctly.
 */

const ADMIN_CONSOLE_URL = process.env.ADMIN_CONSOLE_URL || "http://localhost:3000";

async function testQueueStatus() {
  console.log("\n📊 Testing queue status endpoint...");
  
  try {
    const response = await fetch(`${ADMIN_CONSOLE_URL}/api/queue/status`);
    const data = await response.json();
    
    if (response.ok) {
      console.log("✅ Queue status retrieved successfully:");
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error("❌ Failed to get queue status:", data);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function testQueueTrigger() {
  console.log("\n🚀 Testing queue trigger endpoint...");
  
  try {
    const response = await fetch(`${ADMIN_CONSOLE_URL}/api/queue/process`, {
      method: "POST",
    });
    const data = await response.json();
    
    if (response.ok) {
      console.log("✅ Queue trigger successful:");
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error("❌ Failed to trigger queue:", data);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function runTests() {
  console.log("🧪 Job Queue System Test");
  console.log("========================");
  console.log(`Testing against: ${ADMIN_CONSOLE_URL}`);
  
  await testQueueStatus();
  await testQueueTrigger();
  
  // Wait a bit and check status again
  console.log("\n⏳ Waiting 2 seconds...");
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await testQueueStatus();
  
  console.log("\n✨ Tests complete!");
}

runTests().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
