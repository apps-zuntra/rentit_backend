import { Injectable } from '@nestjs/common';
import axios from 'axios';

import { PrismaService } from '../prisma/prisma.service';
import { LikeService } from '../like/like.service';
import { VisitService } from '../visit/visit.service';

const GROQ_URL =
  'https://api.groq.com/openai/v1/chat/completions';

@Injectable()

export class AiService {

  constructor(

    private prisma: PrismaService,

    private likeService: LikeService,

    private visitService: VisitService,

  ) {}

  // =========================================================
  // MAIN AI SEARCH
  // =========================================================

  async processWithGemini(

    query: string,

    userId: number,

    language: string = 'en',

  ) {

    let filters =
      await this.extractFilters(query);

    filters =
      this.normalizeFilters(filters);

    console.log('🔍 Query:', query);

    console.log('🌐 Language:', language);

    console.log('👤 UserId:', userId);

    console.log('✅ Filters:', filters);

    let results: any[] = [];

    // =====================================
    // LIKED
    // =====================================

    if (
      filters.intent ===
      'liked_properties'
    ) {

      results =
        await this.likeService.getMyLikes(
          userId,
        );
    }

    // =====================================
    // VISITED
    // =====================================

    else if (
      filters.intent ===
      'visited_properties'
    ) {

      results =
        await this.visitService.getMyVisits(
          userId,
        );
    }

    // =====================================
    // ROOMMATES
    // =====================================

    else if (
      filters.intent ===
      'flatmate_search'
    ) {

      results =
        await this.prisma.flatmate.findMany({

          take: 20,

          orderBy: {
            createdAt: 'desc',
          },

        });
    }

    // =====================================
    // OWNER MESSAGE
    // =====================================

    else if (
      filters.intent ===
      'owner_message'
    ) {

      const propertyName =
        query
          .replace(/draft/i, '')
          .replace(/message/i, '')
          .replace(/owner/i, '')
          .replace(/for/i, '')
          .trim();

      results =
        await this.prisma.pGDetails.findMany({

          where: {

            propertyName: {

              contains: propertyName,

              mode: 'insensitive',

            },

          },

          take: 1,

        });
    }

    // =====================================
    // SELLING TIPS
    // =====================================

    else if (
      filters.intent ===
      'selling_tips'
    ) {

      results = [];
    }

    // =====================================
    // CREATE AD
    // =====================================

    else if (
      filters.intent ===
      'create_ad'
    ) {

      const propertyName =
        query
          .replace(/generate/i, '')
          .replace(/ad/i, '')
          .replace(/for/i, '')
          .trim();

      results =
        await this.prisma.pGDetails.findMany({

          where: {

            propertyName: {

              contains: propertyName,

              mode: 'insensitive',

            },

          },

          take: 1,

        });
    }

    // =====================================
    // PROPERTY SEARCH
    // =====================================

    else if (
      filters.intent ===
      'search_property'
    ) {

      results =
        await this.dbSearchWithFilters(
          filters,
        );
    }

    // =====================================
    // AI REPLY
    // =====================================

    const reply =
      await this.generateReply(

        query,

        language,

        filters,

        results,

      );

    return {

      query,

      language,

      filters,

      count: results.length,

      results,

      reply,

    };
  }

  // =========================================================
  // GENERATE REPLY
  // =========================================================

  async generateReply(

    query: string,

    language: string,

    filters: any,

    results: any[],

  ) {

    const languageMap: any = {

      ta: 'Tamil',

      hi: 'Hindi',

      te: 'Telugu',

      kn: 'Kannada',

      en: 'English',

    };

    let propertyText = '';

    // =====================================
    // PROPERTY DETAILS
    // =====================================

    if (
      results &&
      results.length > 0
    ) {

      propertyText =
        results
          .slice(0, 5)
          .map((p: any) => {

            const property =
              p.property || p;

            return `

Property Name:
${property.propertyName || property.pgName || 'Property'}

City:
${property.city || 'Unknown'}

Locality:
${property.locality || 'Unknown'}

Price:
${property.price || property.expectedRent || 'Not Mentioned'}

Parking:
${property.parking || 'Available'}

Wifi:
${property.wifi || 'Available'}

Food:
${property.food || 'Available'}

AC:
${property.ac || 'Available'}

Security:
${property.security || 'Available'}

Furnishing:
${property.furnishing || 'Semi Furnished'}

`;

          })
          .join('\n');
    }

    // =====================================
    // LIKED PROPERTIES
    // =====================================

    if (
  filters.intent ===
  'liked_properties'
) {

  if (!results.length) {

    const emptyLiked: any = {

      ta: 'விருப்பமான சொத்துகள் இல்லை.',

      hi: 'कोई पसंदीदा प्रॉपर्टी नहीं मिली।',

      te: 'ఇష్టమైన ప్రాపర్టీలు కనబడలేదు.',

      kn: 'ಇಷ್ಟಪಟ್ಟ ಆಸ್ತಿಗಳು ಕಂಡುಬಂದಿಲ್ಲ.',

      en: 'No liked properties found.',

    };

    return emptyLiked[language]
      || emptyLiked.en;
  }

  const names = results
    .map((p: any) => {

      const property =
        p.property || p;

      return `

🏠 ${property.propertyName || property.pgName || 'Property'}

📍 ${property.locality || 'Unknown'},
${property.city || 'Unknown'}

`;

    })
    .join('\n');

  const likedTitles: any = {

    ta: 'விருப்பமான சொத்துகள்',

    hi: 'पसंदीदा प्रॉपर्टी',

    te: 'ఇష్టమైన ప్రాపర్టీలు',

    kn: 'ಇಷ್ಟಪಟ್ಟ ಆಸ್ತಿಗಳು',

    en: 'Liked Properties',

  };

  return `
${likedTitles[language] || likedTitles.en}:

${names}
`;
}
if (
  filters.intent ===
  'visited_properties'
) {

  if (!results.length) {

    const emptyVisited: any = {

      ta: 'பார்வையிட்ட சொத்துகள் இல்லை.',

      hi: 'देखी गई प्रॉपर्टी नहीं मिली।',

      te: 'సందర్శించిన ప్రాపర్టీలు కనబడలేదు.',

      kn: 'ಭೇಟಿ ನೀಡಿದ ಆಸ್ತಿಗಳು ಕಂಡುಬಂದಿಲ್ಲ.',

      en: 'No visited properties found.',

    };

    return emptyVisited[language]
      || emptyVisited.en;
  }

  const names = results
    .map((p: any) => {

      const property =
        p.property || p;

      return `

🏠 ${property.propertyName || property.pgName || 'Property'}

📍 ${property.locality || 'Unknown'},
${property.city || 'Unknown'}

`;

    })
    .join('\n');

  const visitedTitles: any = {

    ta: 'பார்வையிட்ட சொத்துகள்',

    hi: 'देखी गई प्रॉपर्टी',

    te: 'సందర్శించిన ప్రాపర్టీలు',

    kn: 'ಭೇಟಿ ನೀಡಿದ ಆಸ್ತಿಗಳು',

    en: 'Visited Properties',

  };

  return `
${visitedTitles[language] || visitedTitles.en}:

${names}
`;
}

    // =====================================
    // SELLING TIPS
    // =====================================

    if (
      filters.intent ===
      'selling_tips'
    ) {

      const tips: any = {

        ta: `
1. உயர்தர புகைப்படங்களை பயன்படுத்துங்கள்
2. சரியான விலையை நிர்ணயிக்கவும்
3. முக்கிய வசதிகளை குறிப்பிடுங்கள்
4. வீட்டை சுத்தமாக வைத்திருக்கவும்
5. வாங்குபவர்களுக்கு விரைவாக பதிலளிக்கவும்
`,

        hi: `
1. अच्छी गुणवत्ता वाली तस्वीरें उपयोग करें
2. सही कीमत तय करें
3. सुविधाओं को स्पष्ट बताएं
4. प्रॉपर्टी को साफ रखें
5. खरीदारों को जल्दी जवाब दें
`,

        te: `
1. మంచి నాణ్యత గల ఫోటోలు ఉపయోగించండి
2. సరైన ధర నిర్ణయించండి
3. ముఖ్యమైన సౌకర్యాలను చూపించండి
4. ఇంటిని శుభ్రంగా ఉంచండి
5. కొనుగోలుదారులకు త్వరగా స్పందించండి
`,

        kn: `
1. ಉತ್ತಮ ಗುಣಮಟ್ಟದ ಫೋಟೋಗಳನ್ನು ಬಳಸಿ
2. ಸರಿಯಾದ ಬೆಲೆ ನಿಗದಿಪಡಿಸಿ
3. ಸೌಲಭ್ಯಗಳನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ತಿಳಿಸಿ
4. ಮನೆಯನ್ನು ಸ್ವಚ್ಛವಾಗಿರಿಸಿ
5. ಖರೀದಿದಾರರಿಗೆ ಬೇಗ ಪ್ರತಿಕ್ರಿಯಿಸಿ
`,

        en: `
1. Use high quality photos
2. Keep realistic pricing
3. Highlight amenities
4. Keep the property clean
5. Respond quickly to buyers
`

      };

      return tips[language] || tips.en;
    }

    // =====================================
    // OWNER MESSAGE
    // =====================================

    if (
      filters.intent ===
      'owner_message'
    ) {

      try {

        const response =
          await axios.post(

            GROQ_URL,

            {

              model:
                'llama-3.3-70b-versatile',

              messages: [

                {

                  role: 'user',

                  content: `

Generate a natural,
human-like message
to a property owner.

IMPORTANT:

1. Reply ONLY in ${languageMap[language]}.

2. Mention the property name naturally.

3. Message should sound like
a real customer.

4. Mention:
- interest in property
- asking rent details
- asking availability
- asking amenities
- asking visit timing

5. Keep response friendly.

6. DO NOT sound robotic.


7. DO NOT use:
"Dear customer"

PROPERTY DETAILS:
${propertyText}

USER QUERY:
${query}

`

                }

              ],

              temperature: 0.7,

            },

            {

              headers: {

                Authorization:
                  `Bearer ${process.env.GROQ_API_KEY}`,

                'Content-Type':
                  'application/json',

              },

            },

          );

        return (

          response.data
          .choices?.[0]
          ?.message?.content

          ||

          'Unable to generate message.'

        );

      } catch {

        return 'Unable to generate message.';
      }
    }

    // =====================================
    // CREATE AD
    // =====================================

    if (
      filters.intent ===
      'create_ad'
    ) {

      try {

        const response =
          await axios.post(

            GROQ_URL,

            {

              model:
                'llama-3.3-70b-versatile',

              messages: [

                {

                  role: 'user',

                  content: `

Create a professional
real estate advertisement.

IMPORTANT:

1. Reply ONLY in ${languageMap[language]}.

2. STRICTLY use ONLY
the property details provided.

3. DO NOT invent:
- property names
- phone numbers
- prices
- fake locations

4. Mention:
- property name
- city
- locality
- wifi
- parking
- furnishing
- security
- food
- AC
- price

5. Keep it attractive.

6. If any detail is missing,
skip it.

PROPERTY DETAILS:
${propertyText}

USER QUERY:
${query}

`

                }

              ],

              temperature: 0.6,

            },

            {

              headers: {

                Authorization:
                  `Bearer ${process.env.GROQ_API_KEY}`,

                'Content-Type':
                  'application/json',

              },

            },

          );

        return (

          response.data
          .choices?.[0]
          ?.message?.content

          ||

          'Ad generation failed.'

        );

      } catch {

        return 'Unable to generate ad.';
      }
    }

    // =====================================
    // GENERAL CHAT
    // =====================================
    
    const prompt = `

You are Zuntra AI Assistant.

You help users with:

- rentals
- PGs
- roommates
- real estate
- study help
- productivity
- general conversations

IMPORTANT RULES:

1. Reply ONLY in ${languageMap[language]}.

2. Keep responses natural.

3. Never say:
- I could not find exact matches
- I am only a real estate assistant

4. Be friendly.

5. If user greets,
reply warmly.

6. Never invent fake properties.

7. If no data exists,
say it clearly.

8. Keep answers short and natural.


USER QUERY:
${query}

INTENT:
${filters.intent}

PROPERTY DETAILS:
${propertyText}

`;

    try {

      const response =
        await axios.post(

          GROQ_URL,

          {

            model:
              'llama-3.3-70b-versatile',

            messages: [

              {
                role: 'user',
                content: prompt,
              },

            ],

            temperature: 0.5,

          },

          {

            headers: {

              Authorization:
                `Bearer ${process.env.GROQ_API_KEY}`,

              'Content-Type':
                'application/json',

            },

          },

        );

      return (

        response.data
        .choices?.[0]
        ?.message?.content

        ||

        'No response'

      );

    } catch (error: any) {

  console.log(
    '🔥 GROQ GENERAL CHAT ERROR =>',
    error?.response?.data || error.message,
  );

  return 'Sorry, unable to respond right now.';
}
  }

  // =========================================================
  // FILTER EXTRACTION
  // =========================================================

  async extractFilters(
    query: string,
  ): Promise<any> {

    const prompt = `

You are an AI that extracts
real estate filters.

SUPPORTED LANGUAGES:
- English
- Tamil
- Hindi
- Telugu
- Kannada

Detect intents:

- general_chat
- search_property
- liked_properties
- visited_properties
- flatmate_search
- owner_message
- selling_tips
- create_ad

IMPORTANT:

If user mentions:
- pg
- flat
- apartment
- villa
- hostel
- property
- rental
- city names

Then intent MUST be:
"search_property"
IMPORTANT TAMIL RULES:

"விருப்பமான"
means liked_properties

"பார்வையிட்ட"
means visited_properties
"पसंदीदा प्रॉपर्टी"
means liked_properties reply in hindi

Never confuse them.

Extract:
- city
- locality
- propertyType
- maxPrice

Return ONLY JSON.

USER QUERY:
"${query}"

`;

    try {

      const response =
        await axios.post(

          GROQ_URL,

          {

            model:
              'llama-3.3-70b-versatile',

            messages: [

              {
                role: 'user',
                content: prompt,
              },

            ],

            temperature: 0.1,

          },

          {

            headers: {

              Authorization:
                `Bearer ${process.env.GROQ_API_KEY}`,

              'Content-Type':
                'application/json',

            },

          },

        );

      let text =

        response.data
        .choices?.[0]
        ?.message?.content || '{}';

      text = text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const match =
        text.match(/\{[\s\S]*\}/);

      if (!match) {

        return {
          intent:
            'general_chat',
        };
      }

      return JSON.parse(match[0]);

    } catch {

      return {
        intent:
          'general_chat',
      };
    }
  }

  // =========================================================
  // NORMALIZE
  // =========================================================

  normalizeFilters(filters: any) {

    return filters;
  }

  // =========================================================
  // DB SEARCH WITH FILTERS
  // =========================================================

  async dbSearchWithFilters(
    filters: any,
  ) {

    const where: any = {

      isDeleted: false,

      isDraft: false,

    };

    if (filters.city) {

      where.city = {

        contains:
          filters.city,

        mode:
          'insensitive',

      };
    }

    if (filters.locality) {

      where.locality = {

        contains:
          filters.locality,

        mode:
          'insensitive',

      };
    }

    if (filters.propertyType) {

      where.propertyType = {

        contains:
          filters.propertyType,

        mode:
          'insensitive',

      };
    }

    if (filters.maxPrice) {

      where.price = {

        lte:
          Number(filters.maxPrice),

      };
    }

    console.log(
      '🔥 WHERE =>',
      where,
    );

    return this.prisma.pGDetails.findMany({

      where,

      orderBy: {
        createdAt: 'desc',
      },

      take: 20,

    });
  }

  // =========================================================
  // NORMAL SEARCH
  // =========================================================

  async dbSearch(
    query: string,
  ) {

    return this.prisma.pGDetails.findMany({

      where: {

        OR: [

          {
            city: {
              contains: query,
              mode: 'insensitive',
            },
          },

          {
            locality: {
              contains: query,
              mode: 'insensitive',
            },
          },

          {
            propertyType: {
              contains: query,
              mode: 'insensitive',
            },
          },

        ],

      },

      take: 10,

    });
  }

  // =========================================================
  // RECOMMENDATIONS
  // =========================================================

  async getRecommendations(
    city: string,
    budget?: number,
    gender?: string,
  ) {

    const where: any = {

      city: {

        contains: city,

        mode:
          'insensitive',

      },

    };

    if (budget) {

      where.price = {

        lte: budget,

      };
    }

    return this.prisma.pGDetails.findMany({

      where,

      take: 10,

    });
  }

  // =========================================================
  // TRENDING
  // =========================================================

  async getTrending(
    city?: string,
  ) {

    const where: any = {};

    if (city) {

      where.city = {

        contains: city,

        mode: 'insensitive',

      };
    }

    return this.prisma.pGDetails.findMany({

      where,

      take: 8,

    });
  }

  // =========================================================
  // SIMILAR
  // =========================================================

  async getSimilar(
    id: number,
  ) {

    return [];
  }

  // =========================================================
  // VIEW COUNT
  // =========================================================

  async incrementView(
    id: number,
  ) {

    return {
      success: true,
    };
  }
}