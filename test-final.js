#!/usr/bin/env node

// Final test with the actual scraper parsing logic
import { readFile } from 'fs/promises';

async function testFinalParsing() {
  try {
    const dimmableHtml = await readFile('/Users/thomassorensen/TK Sørensen/Homebridge/htmlfiles/dimmable_lights.html', 'utf8');
    
    console.log('=== Final Scraper Test ===');
    
    let count = 0;
    const devicePattern = /<li id="class=\"ui-li-static\"(\d+)\"[^>]*>([\s\S]*?)<\/li>/g;
    let match;
    
    while ((match = devicePattern.exec(dimmableHtml)) !== null && count < 5) {
      if (!match[1]) continue;
      const paramId = parseInt(match[1], 10);
      if (isNaN(paramId)) continue;
      
      const deviceBlock = match[0];
      console.log(`\nFound device block for paramid: ${paramId}`);
      
      // Extract device name from (Fx) pattern
      const nameMatch = deviceBlock.match(/<div[^>]*>\(Fx\)\s*([^<]+)<\/div>/);
      let deviceName = '';
      if (nameMatch && nameMatch[1]) {
        deviceName = nameMatch[1].trim();
      }
      
      // Extract room name
      let room = '';
      const roomMatch = deviceBlock.match(/<div class="ValoriAjax">([^<]+)/);
      if (roomMatch && roomMatch[1]) {
        const roomText = roomMatch[1].trim();
        if (roomText && 
            !roomText.includes('%') && 
            !roomText.toLowerCase().includes('off') &&
            !roomText.toLowerCase().includes('on') &&
            !roomText.includes('function_state') &&
            roomText.length > 1 && 
            roomText.length < 50) {
          room = roomText;
        }
      }
      
      if (deviceName) {
        const accessoryName = room && room !== deviceName ? `${room} - ${deviceName}` : deviceName;
        console.log(`SUCCESS: ${accessoryName} (ID: ${paramId})`);
        count++;
      }
    }
    
    console.log(`\nTotal parsed: ${count} devices`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testFinalParsing();