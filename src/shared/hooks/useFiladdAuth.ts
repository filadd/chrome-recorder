import { useEffect, useState } from "react";

import { getFiladdAuth, onFiladdAuthChange, type FiladdAuth } from "../auth";

export const useFiladdAuth = (): [FiladdAuth | null, boolean] => {
  const [auth, setAuth] = useState<FiladdAuth | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getFiladdAuth().then((initial) => {
      setAuth(initial);
      setLoaded(true);
    });

    return onFiladdAuthChange(() => {
      getFiladdAuth().then(setAuth);
    });
  }, []);

  return [auth, loaded];
};
