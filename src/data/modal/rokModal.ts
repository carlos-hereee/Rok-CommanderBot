
export const getOtherBuilds = (arr, build) => {
  let other_builds = "";
  let index = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].build) other_builds += `${arr[i].build}, `;
    if (arr[i].build === build) index = i;
  }
  return [{ ...arr[index], other_builds }];
};


