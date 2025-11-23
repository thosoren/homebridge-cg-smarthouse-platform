#!/usr/bin/env node

// Test improved regex parsing
import { readFile } from 'fs/promises';

async function testImprovedParsing() {
  try {
    console.log('Testing improved regex parsing...');
    
    const dimmableHtml = await readFile('/Users/thomassorensen/TK Sørensen/Homebridge/htmlfiles/dimmable_lights.html', 'utf8');
    console.log('\n=== Testing dimmable_lights.html ===');
    
    let count = 0;
    const devicePattern = /<li id="class="ui-li-static"(\d+)"[^>]*>([\s\S]*?)<\/li>/g;
    let match;
    
    while ((match = devicePattern.exec(dimmableHtml)) !== null && count < 5) {
      const paramId = parseInt(match[1], 10);
      const deviceBlock = match[0];
      
      console.log(`\n--- Device ${paramId} ---`);
      
      // Extract device name from (Fx) pattern
      const nameMatch = deviceBlock.match(/<div[^>]*>\(Fx\)\s*([^<]+)<\/div>/);
      let deviceName = '';
      if (nameMatch && nameMatch[1]) {
        deviceName = nameMatch[1].trim();
      }
      
      // Extract room name from ValoriAjax div (not the status one)
      const roomMatches = deviceBlock.match(/<div class="ValoriAjax">([^<]+)<\/div>/g);
      let room = '';
      if (roomMatches) {
        for (const roomMatch of roomMatches) {
          const roomText = roomMatch.replace(/<[^>]*>/g, '').trim();
          // Skip status text like percentages or Off/On
          if (roomText && 
              !roomText.includes('%') && 
              !roomText.toLowerCase().includes('off') &&
              !roomText.toLowerCase().includes('on') &&
              roomText.length > 1) {
            room = roomText;
            break;
          }
        }
      }
      
      console.log(`Device: "${deviceName}"`);
      console.log(`Room: "${room}"`);
      
      if (deviceName) {
        const accessoryName = room && room !== deviceName ? `${room} - ${deviceName}` : deviceName;
        console.log(`FINAL: ${accessoryName} (ID: ${paramId})`);
        count++;
      }
    }
    
    console.log(`\nTotal devices parsed: ${count}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testImprovedParsing();