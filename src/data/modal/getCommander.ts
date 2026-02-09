import commanders from '../seeds/commander.json'

export const getCommander  =async (name:any, build:any) => {
    const filtered = commanders.filter((c)=> c.name.toUpperCase()===name.toUpperCase())
    if(build) return filtered.filter(c=> c.build === build)
    return filtered

  };
      