import { extractCVText, detectLevelFromCV } from '../services/cv.service';

async function main() {
  const cvUrl = 'https://my.visualcv.com/dmitry_p_software_engineer/';

  console.log('Fetching CV...');
  const cvText = await extractCVText(cvUrl);

  console.log('CV text length:', cvText.length);
  console.log('First 500 chars:');
  console.log(cvText.slice(0, 500));

  if (cvText) {
    console.log('\nDetecting level...');
    const level = await detectLevelFromCV(cvText);
    console.log('Detected level:', level);
  }
}

main().catch(console.error);