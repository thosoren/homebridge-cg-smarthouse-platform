#!/usr/bin/env node

// Test regex parsing with the sample files
import { readFile } from 'fs/promises';

async function testRegexParsing() {
  try {
    console.log('Testing regex parsing with sample files...');
    
    // Test dimmable lights
    const dimmableHtml = await readFile('/Users/thomassorensen/TK Sørensen/Homebridge/htmlfiles/dimmable_lights.html', 'utf8');
    console.log('\n=== Testing dimmable_lights.html ===');
    console.log(`File length: ${dimmableHtml.length}`);
    
    let count = 0;
    
    // Pattern: <li id="class="ui-li-static"PARAMID"> followed by device info
    const devicePattern = /<li id="class="ui-li-static"(\d+)"[^>]*>[\s\S]*?<\/li>/g;
    let match;
    
    while ((match = devicePattern.exec(dimmableHtml)) !== null && count < 5) {
      const paramId = parseInt(match[1], 10);
      const deviceBlock = match[0];
      
      console.log(`\nFound device block for paramid: ${paramId}`);
      console.log(`Block length: ${deviceBlock.length}`);
      
      // Extract device name - look for (Fx) pattern
      const nameMatch = deviceBlock.match(/\(Fx\)\s*([^<]+)/);
      let deviceName = '';
      if (nameMatch && nameMatch[1]) {
        deviceName = nameMatch[1].trim();
        console.log(`Device name: "${deviceName}"`);
      }
      
      // Extract room name - look for div with room info
      const roomMatches = deviceBlock.match(/<div[^>]*>([^<]+)<\/div>/g);
      let room = '';
      if (roomMatches) {
        console.log(`Found ${roomMatches.length} room div matches`);
        for (const roomMatch of roomMatches) {
          const roomText = roomMatch.replace(/<[^>]*>/g, '').trim();
          console.log(`  Room candidate: "${roomText}"`);
          
          // Skip unwanted text
          if (roomText && 
              !roomText.includes('(Fx)') && 
              !roomText.includes('%') && 
              !roomText.toLowerCase().includes('off') &&
              !roomText.toLowerCase().includes('on') &&
              !roomText.includes('ValoriAjax') &&
              !roomText.includes('function_state') &&
              roomText.length > 1 && 
              roomText.length < 50) {
            room = roomText;
            console.log(`  Selected room: "${room}"`);
            break;
          }
        }
      }
      
      if (deviceName) {
        const accessoryName = room && room !== deviceName ? `${room} - ${deviceName}` : deviceName;
        console.log(`RESULT: ${accessoryName} (ID: ${paramId})`);
        count++;
      }
    }
    
    console.log(`\nTotal devices found: ${count}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testRegexParsing();