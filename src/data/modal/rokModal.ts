
export const getOtherBuilds = (arr, build) => {
  let other_builds = "";
  let index = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].build) other_builds += `${arr[i].build}, `;
    if (arr[i].build === build) index = i;
  }
  return [{ ...arr[index], other_builds }];
};

export const getCity = (level:string) => {
  return []
  // return db("city").where({ level });
};
export const getCastle = (level:string) => {
  return []
  // return db("castle").where({ level });
};
