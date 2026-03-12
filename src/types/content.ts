export interface Certificate {
  title: string;
  issuer: string;
  date: string;
  pdfUrl: string | null;
}

export interface Skill {
  name: string;
  icon: string;
  description: string;
}

export interface Technology {
  name: string;
  icon: string;
}

export interface OperatingSystem {
  name: string;
  icon: string;
}

export interface SkillsData {
  skills: Skill[];
  technologies: Technology[];
  operatingSystems: OperatingSystem[];
}

export interface BlogPost {
  title: string;
  description: string;
  tags: string[];
  author: string;
  publishDate: string;
  blogUrl: string;
  thumbnail: string;
  highlight?: boolean;
}
