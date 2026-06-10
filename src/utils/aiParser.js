/**
 * Parses the AI response, whether it's standard JSON or raw free text.
 * Extracts: recommendations, orientation, house rotation degrees, wind direction, and strategy.
 */
export const parseAiText = (text) => {
  if (!text) return null;
  
  // 1. Try to parse as JSON first
  try {
    const cleanJsonText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJsonText);
    if (parsed.layout || parsed.recommendations) {
      return {
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        orientation: parsed.layout?.orientation || 'diagonal',
        houseRotationDegree: parsed.layout?.houseRotationDegree ?? 45,
        windDirection: parsed.layout?.windProtection?.direction || 'nw',
        windStrategy: parsed.layout?.windProtection?.strategy || 'נטיעת צמחייה וקירות מגן',
        corners: Array.isArray(parsed.layout?.corners) ? parsed.layout.corners : null
      };
    }
  } catch (e) {
    // Not JSON, continue to text parsing
  }

  // 2. Parse free text in Hebrew and English
  const recommendations = [];
  let orientation = 'diagonal';
  let houseRotationDegree = 45;
  let windDirection = 'nw';
  let windStrategy = '';

  // Extract recommendations by spliting bullet points or lines
  const lines = text.split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+[\.\)]/.test(trimmed)) {
      const content = trimmed.replace(/^[-*\s\d\.\)]+/g, '').trim();
      if (content.length > 5) {
        recommendations.push(content);
      }
    } else if (trimmed.length > 30 && recommendations.length < 5) {
      // If it looks like a recommendation sentence
      if (trimmed.includes('מומלץ') || trimmed.includes('כדאי') || trimmed.includes('חשוב') || trimmed.includes('תכנון') || trimmed.includes('העמדה')) {
        recommendations.push(trimmed);
      }
    }
  });

  const lowerText = text.toLowerCase();
  
  // Extract orientation
  if (lowerText.includes('צפון-דרום') || lowerText.includes('צפון דרום') || lowerText.includes('north-south') || lowerText.includes('n-s')) {
    orientation = 'north-south';
    houseRotationDegree = 0;
  } else if (lowerText.includes('מזרח-מערב') || lowerText.includes('מזרח מערב') || lowerText.includes('east-west') || lowerText.includes('e-w')) {
    orientation = 'east-west';
    houseRotationDegree = 90;
  } else if (lowerText.includes('אלכסון') || lowerText.includes('אלכסוני') || lowerText.includes('diagonal')) {
    orientation = 'diagonal';
    houseRotationDegree = 45;
  }

  // Extract rotation degree (e.g. "45 מעלות", "זווית של 30 מעלות", " rotation of 90 degrees")
  const degreeMatch = text.match(/(\d+)\s*(מעלות|degree|deg)/i);
  if (degreeMatch) {
    const val = parseInt(degreeMatch[1], 10);
    if (val >= 0 && val <= 360) {
      houseRotationDegree = val;
    }
  }

  // Extract wind direction
  // Look for NW, W, North-West, צפון-מערב, etc.
  const windPatterns = {
    'nw': [/צפון\s*-?\s*מערב/i, /nw/i, /north-west/i],
    'ne': [/צפון\s*-?\s*מזרח/i, /ne/i, /north-east/i],
    'se': [/דרום\s*-?\s*מזרח/i, /se/i, /south-east/i],
    'sw': [/דרום\s*-?\s*מערב/i, /sw/i, /south-west/i],
    'n': [/צפון(?!\s*-?\s*מערב|\s*-?\s*מזרח)/i, /\bn\b/i, /north/i],
    'e': [/מזרח(?!\s*-?\s*דרום|\s*-?\s*צפון)/i, /\be\b/i, /east/i],
    's': [/דרום(?!\s*-?\s*מזרח|\s*-?\s*מערב)/i, /\bs\b/i, /south/i],
    'w': [/מערב(?!\s*-?\s*צפון|\s*-?\s*דרום)/i, /\bw\b/i, /west/i]
  };

  for (const [dir, regexes] of Object.entries(windPatterns)) {
    if (regexes.some(r => r.test(text))) {
      windDirection = dir;
      break;
    }
  }

  // Extract wind protection strategy
  const strategyMatch = text.match(/(הגנה מרוח|רוח עיקרית|רוחות|אסטרטגיית הגנה|wind protection|wind strategy)[\s:]*([^.\n]+)/i);
  if (strategyMatch) {
    windStrategy = strategyMatch[2].trim();
  } else {
    // Look for keywords in text
    if (lowerText.includes('עצים') || lowerText.includes('צמחייה') || lowerText.includes('trees')) {
      windStrategy = 'נטיעת שורת עצים וצמחייה עבותה בצד הרוח הפופולרית';
    } else if (lowerText.includes('חומה') || lowerText.includes('קיר') || lowerText.includes('wall')) {
      windStrategy = 'בניית קיר מגן אקוסטי או חומה אדריכלית מונעת רוחות';
    } else {
      windStrategy = 'הצללה מסיבית וקירות חוסמי סופות חול בכיוון הרוח';
    }
  }

  // If no recommendations found, fallback to paragraph sentences
  if (recommendations.length === 0) {
    const paras = text.split('\n').map(p => p.trim()).filter(p => p.length > 15 && p.length < 150);
    recommendations.push(...paras.slice(0, 4));
  }

  // Parse house corners from free text
  let corners = null;
  const cornersRegex = /(?:פינות|פינות הבית|פינות המבנה|corners|layout corners)[\s:]*([^\n]+)/i;
  const cornersMatch = text.match(cornersRegex);
  if (cornersMatch) {
    const rawCoords = cornersMatch[1];
    const numbers = rawCoords.match(/-?\d+(\.\d+)?/g);
    if (numbers && numbers.length >= 6 && numbers.length % 2 === 0) {
      const parsedCorners = [];
      for (let i = 0; i < numbers.length; i += 2) {
        parsedCorners.push([parseFloat(numbers[i]), parseFloat(numbers[i+1])]);
      }
      corners = parsedCorners;
    }
  }

  if (!corners) {
    // Try matching bracketed/parenthesized coordinates anywhere in the text (e.g. multi-line list)
    const braceCoords = text.match(/[(\[]\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*[)\]]/g);
    if (braceCoords && braceCoords.length >= 3) {
      corners = braceCoords.map(coordStr => {
        const nums = coordStr.match(/-?\d+(\.\d+)?/g);
        return [parseFloat(nums[0]), parseFloat(nums[1])];
      });
    }
  }

  if (!corners) {
    // Try matching lines with exactly two numbers (e.g. raw coordinate copy-paste)
    const lines = text.split('\n');
    const parsedCorners = [];
    for (const line of lines) {
      // Ignore lines that have words/letters to avoid matching random text numbers
      if (/[a-zA-Z\u0590-\u05FF]/.test(line)) continue;
      const nums = line.match(/-?\d+(?:\.\d+)?/g);
      if (nums && nums.length === 2) {
        parsedCorners.push([parseFloat(nums[0]), parseFloat(nums[1])]);
      }
    }
    if (parsedCorners.length >= 3) {
      corners = parsedCorners;
    }
  }

  return {
    recommendations: recommendations.slice(0, 6),
    orientation,
    houseRotationDegree,
    windDirection,
    windStrategy,
    corners
  };
};
