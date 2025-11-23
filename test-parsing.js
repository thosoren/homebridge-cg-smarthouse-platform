#!/usr/bin/env node

// Test HTML parsing with the sample files
import { parse as parseHtml } from 'node-html-parser';
import { readFile } from 'fs/promises';

async function testParsing() {
  try {
    console.log('Testing HTML parsing with sample files...');
    
    // Test dimmable lights
    let dimmableHtml = await readFile('/Users/thomassorensen/TK Sørensen/Homebridge/htmlfiles/dimmable_lights.html', 'utf8');
    console.log('\n=== Testing dimmable_lights.html ===');
    console.log(`File length: ${dimmableHtml.length}`);
    
    // Fix malformed HTML - replace invalid id attributes
    dimmableHtml = dimmableHtml.replace(/id="class="ui-li-static"(\d+)">/g, 'id="li-static-$1">');
    console.log('Fixed malformed HTML id attributes');
    
    const tree = parseHtml(dimmableHtml);
    const listItems = tree.querySelectorAll('li');
    console.log(`Found ${listItems.length} li elements`);
    
    // Also try searching by text content
    console.log('\n=== Searching for paramids in HTML text ===');
    const paramIds = dimmableHtml.match(/(\d{3,5})/g);
    if (paramIds) {
      console.log(`Found potential paramids: ${paramIds.slice(0, 10).join(', ')}...`);
    }
    
    let count = 0;
    for (const item of listItems) {
      const idAttr = item.getAttribute('id') || '';
      console.log(`Li id: "${idAttr}"`);
      
      // Extract paramid from fixed id
      const paramIdMatch = idAttr.match(/li-static-(\d+)/);
      
      if (paramIdMatch && paramIdMatch[1]) {
        const paramId = parseInt(paramIdMatch[1], 10);
        console.log(`  Found paramid: ${paramId}`);
        
        const divs = item.querySelectorAll('div');
        console.log(`  Found ${divs.length} divs`);
        
        for (const div of divs) {
          const text = (div.text || div.textContent || div.innerHTML || '').trim();
          if (text.length > 0 && !text.includes('<')) {
            console.log(`    Div text: "${text}"`);
          }
        }
        
        count++;
        if (count >= 3) break; // Just show first 3 for debugging
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testParsing();