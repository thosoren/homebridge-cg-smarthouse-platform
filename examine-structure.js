#!/usr/bin/env node

// Test detailed HTML structure examination
import { readFile } from 'fs/promises';

async function examineStructure() {
  try {
    const dimmableHtml = await readFile('/Users/thomassorensen/TK Sørensen/Homebridge/htmlfiles/dimmable_lights.html', 'utf8');
    
    // Extract just one device block for detailed examination
    const deviceMatch = dimmableHtml.match(/<li id="class="ui-li-static"896"[^>]*>([\s\S]*?)<\/li>/);
    if (deviceMatch) {
      console.log('=== Device Block 896 Structure ===');
      console.log(deviceMatch[0]);
      console.log('\n=== Extracted Parts ===');
      
      // Look for all text content
      const allText = deviceMatch[0].match(/>([^<]+)</g);
      if (allText) {
        console.log('All text content:');
        allText.forEach((text, i) => {
          const cleaned = text.replace(/^>/, '').replace(/<$/, '').trim();
          if (cleaned) {
            console.log(`  ${i}: "${cleaned}"`);
          }
        });
      }
      
      // Look specifically in td content
      const tdMatch = deviceMatch[0].match(/<td[^>]*align="left"[^>]*>(.*?)<\/td>/s);
      if (tdMatch) {
        console.log('\n=== TD Content ===');
        console.log(tdMatch[1]);
        
        // Extract divs from td
        const divMatches = tdMatch[1].match(/<div[^>]*>([^<]*)<\/div>/g);
        if (divMatches) {
          console.log('\nDivs in TD:');
          divMatches.forEach((div, i) => {
            const content = div.replace(/<[^>]*>/g, '');
            console.log(`  ${i}: "${content}"`);
          });
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

examineStructure();